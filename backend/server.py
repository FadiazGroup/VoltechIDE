from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Depends, HTTPException, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
import asyncio
import hashlib
import random
import string
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone

from fastapi.responses import FileResponse

from auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_role
)
from pin_rules import validate_pin_config, get_board_profile
from build_service import real_build_process, get_public_key_pem, ARTIFACTS_DIR

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── Pydantic Models ────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

class DeviceCreate(BaseModel):
    name: str
    board_type: str = "ESP32-C3"
    mac_address: Optional[str] = None

class DeviceClaimRequest(BaseModel):
    claim_code: str

class PinConfigUpdate(BaseModel):
    pins: Dict[str, str]  # {"0": "GPIO_INPUT", "1": "ADC", ...}

class ProjectCreate(BaseModel):
    name: str
    board_type: str = "ESP32-C3"
    template: Optional[str] = None  # "blank", "fleet_agent"

class ProjectFileUpdate(BaseModel):
    files: List[Dict[str, str]]  # [{"name": "main.c", "content": "..."}]

class BuildTrigger(BaseModel):
    project_id: str
    target_version: str  # semver

class DeployCreate(BaseModel):
    build_id: str
    target_device_ids: List[str]
    rollout_percent: int = 100
    rollout_strategy: str = "immediate"  # immediate, canary

class DeployRollback(BaseModel):
    reason: str = ""

class TelemetryHeartbeat(BaseModel):
    device_id: str
    firmware_version: str
    rssi: int = 0
    free_heap: int = 0
    uptime: int = 0

class OTACheckRequest(BaseModel):
    device_id: str
    current_version: str

class UserRoleUpdate(BaseModel):
    role: str

# ─── Helpers ────────────────────────────────────────────────────────
def now_iso():
    return datetime.now(timezone.utc).isoformat()

def gen_id():
    return str(uuid.uuid4())

def gen_claim_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

async def audit_log(user_id: str, user_email: str, action: str, resource_type: str, resource_id: str, details: str = ""):
    await db.audit_logs.insert_one({
        "id": gen_id(),
        "user_id": user_id,
        "user_email": user_email,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details,
        "timestamp": now_iso(),
    })

# ─── AUTH ROUTES ────────────────────────────────────────────────────
@api_router.post("/auth/register")
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = gen_id()
    user_count = await db.users.count_documents({})
    role = "admin" if user_count == 0 else "developer"
    user = {
        "id": user_id,
        "email": req.email,
        "name": req.name,
        "password_hash": hash_password(req.password),
        "role": role,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user_id, req.email, role)
    await audit_log(user_id, req.email, "register", "user", user_id)
    return {"token": token, "user": {"id": user_id, "email": req.email, "name": req.name, "role": role}}

@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["email"], user["role"])
    await audit_log(user["id"], user["email"], "login", "user", user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u

# ─── DEVICE ROUTES ──────────────────────────────────────────────────
@api_router.get("/devices")
async def list_devices(user: dict = Depends(get_current_user)):
    query = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    devices = await db.devices.find(query, {"_id": 0}).to_list(500)
    return devices

@api_router.post("/devices")
async def create_device(req: DeviceCreate, user: dict = Depends(require_role("admin", "developer"))):
    device_id = gen_id()
    claim_code = gen_claim_code()
    device = {
        "id": device_id,
        "name": req.name,
        "board_type": req.board_type,
        "mac_address": req.mac_address or "",
        "claim_code": claim_code,
        "owner_id": user["id"],
        "status": "offline",
        "firmware_version": "0.0.0",
        "last_seen": None,
        "rssi": 0,
        "free_heap": 0,
        "last_ota_status": "none",
        "created_at": now_iso(),
    }
    await db.devices.insert_one(device)
    await audit_log(user["id"], user["email"], "create_device", "device", device_id, f"Device: {req.name}")
    result = {k: v for k, v in device.items() if k != "_id"}
    return result

@api_router.get("/devices/{device_id}")
async def get_device(device_id: str, user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if user["role"] != "admin" and device.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return device

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, user: dict = Depends(require_role("admin", "developer"))):
    device = await db.devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if user["role"] != "admin" and device.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.devices.delete_one({"id": device_id})
    await audit_log(user["id"], user["email"], "delete_device", "device", device_id)
    return {"message": "Device deleted"}

@api_router.post("/devices/claim")
async def claim_device(req: DeviceClaimRequest, user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"claim_code": req.claim_code}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Invalid claim code")
    await db.devices.update_one({"id": device["id"]}, {"$set": {"owner_id": user["id"], "claim_code": ""}})
    await audit_log(user["id"], user["email"], "claim_device", "device", device["id"])
    return {"message": "Device claimed successfully", "device_id": device["id"]}

# ─── PIN CONFIG ROUTES ──────────────────────────────────────────────
@api_router.get("/board-profile")
async def get_board_profile_route():
    return get_board_profile()

@api_router.get("/devices/{device_id}/pins")
async def get_pin_config(device_id: str, user: dict = Depends(get_current_user)):
    config = await db.pin_configs.find_one({"device_id": device_id}, {"_id": 0})
    if not config:
        return {"device_id": device_id, "board_type": "ESP32-C3", "pins": {}}
    return config

@api_router.put("/devices/{device_id}/pins")
async def update_pin_config(device_id: str, req: PinConfigUpdate, user: dict = Depends(require_role("admin", "developer"))):
    validation = validate_pin_config(req.pins)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail={"errors": validation["errors"], "warnings": validation["warnings"]})
    config = {
        "device_id": device_id,
        "board_type": "ESP32-C3",
        "pins": req.pins,
        "updated_at": now_iso(),
        "updated_by": user["id"],
    }
    await db.pin_configs.update_one({"device_id": device_id}, {"$set": config}, upsert=True)
    await audit_log(user["id"], user["email"], "update_pin_config", "device", device_id)
    return {**config, "validation": validation}

@api_router.post("/pins/validate")
async def validate_pins(req: PinConfigUpdate, user: dict = Depends(get_current_user)):
    return validate_pin_config(req.pins)

# ─── TEMPLATE ROUTES ────────────────────────────────────────────────
TEMPLATES_DIR = ROOT_DIR / "firmware_templates"

def _load_template_files(template_name: str) -> list:
    """Load all source files from a firmware template directory."""
    tpl_dir = TEMPLATES_DIR / template_name
    if not tpl_dir.exists():
        return []
    files = []
    for fp in sorted(tpl_dir.iterdir()):
        if fp.is_file() and fp.suffix in ('.c', '.h', '.ini', '.txt', '.cmake', '.cfg'):
            files.append({"name": fp.name, "content": fp.read_text()})
    return files

@api_router.get("/templates")
async def list_templates():
    """List available project templates."""
    templates = [
        {
            "id": "blank",
            "name": "Blank Project",
            "description": "Empty ESP-IDF project with a minimal app_main()",
            "files_count": 1,
        },
        {
            "id": "fleet_agent",
            "name": "Fleet Agent (Full)",
            "description": "Complete fleet agent with Wi-Fi provisioning, AP captive portal, OTA updates, telemetry heartbeat, and device claim flow",
            "files_count": len(_load_template_files("esp32c3_fleet_agent")),
        },
    ]
    return templates

@api_router.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get template files preview."""
    if template_id == "blank":
        return {"id": "blank", "files": [{"name": "main.c", "content": "// Blank ESP-IDF project\n"}]}
    elif template_id == "fleet_agent":
        files = _load_template_files("esp32c3_fleet_agent")
        if not files:
            raise HTTPException(status_code=404, detail="Template files not found")
        return {"id": "fleet_agent", "files": files}
    raise HTTPException(status_code=404, detail="Template not found")

# ─── PROJECT ROUTES ─────────────────────────────────────────────────
@api_router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    query = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    projects = await db.projects.find(query, {"_id": 0}).to_list(100)
    return projects

@api_router.post("/projects")
async def create_project(req: ProjectCreate, user: dict = Depends(require_role("admin", "developer"))):
    project_id = gen_id()

    # Load files based on template selection
    if req.template == "fleet_agent":
        files = _load_template_files("esp32c3_fleet_agent")
        if not files:
            files = [{"name": "main.c", "content": "// Template not found\n"}]
    else:
        # Default blank template
        default_main = '''#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

static const char *TAG = "main";

void app_main(void)
{
    ESP_LOGI(TAG, "ESP32-C3 Application Started");
    
    while (1) {
        ESP_LOGI(TAG, "Hello from ESP32-C3!");
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
'''
        files = [{"name": "main.c", "content": default_main}]

    project = {
        "id": project_id,
        "name": req.name,
        "board_type": req.board_type,
        "owner_id": user["id"],
        "template": req.template or "blank",
        "files": files,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(project)
    await audit_log(user["id"], user["email"], "create_project", "project", project_id, f"Template: {req.template or 'blank'}")
    result = {k: v for k, v in project.items() if k != "_id"}
    return result

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@api_router.put("/projects/{project_id}")
async def update_project(project_id: str, req: ProjectFileUpdate, user: dict = Depends(require_role("admin", "developer"))):
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"files": [f for f in req.files], "updated_at": now_iso()}}
    )
    await audit_log(user["id"], user["email"], "update_project", "project", project_id)
    return {"message": "Project updated"}

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(require_role("admin", "developer"))):
    await db.projects.delete_one({"id": project_id})
    await audit_log(user["id"], user["email"], "delete_project", "project", project_id)
    return {"message": "Project deleted"}

# ─── BUILD ROUTES ───────────────────────────────────────────────────
async def _run_build(build_id: str, project_id: str, version: str, board_type: str):
    """Background task: run real PlatformIO build."""
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        await db.builds.update_one({"id": build_id}, {"$set": {"status": "failed", "logs": ["Project not found"]}})
        return
    await real_build_process(
        build_id=build_id,
        project_files=project.get("files", []),
        board_type=board_type,
        version=version,
        db=db,
    )

@api_router.post("/builds")
async def trigger_build(req: BuildTrigger, background_tasks: BackgroundTasks, user: dict = Depends(require_role("admin", "developer"))):
    project = await db.projects.find_one({"id": req.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    build_id = gen_id()
    board_type = project.get("board_type", "ESP32-C3")
    build = {
        "id": build_id,
        "project_id": req.project_id,
        "project_name": project["name"],
        "board_type": board_type,
        "owner_id": user["id"],
        "version": req.target_version,
        "status": "queued",
        "logs": [f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] [INFO] Build queued for {project['name']} v{req.target_version} ({board_type})"],
        "artifact_hash": "",
        "artifact_size": 0,
        "artifact_file": "",
        "manifest_file": "",
        "manifest": None,
        "ram_usage": "",
        "flash_usage": "",
        "started_at": now_iso(),
        "completed_at": None,
    }
    await db.builds.insert_one(build)
    background_tasks.add_task(_run_build, build_id, req.project_id, req.target_version, board_type)
    await audit_log(user["id"], user["email"], "trigger_build", "build", build_id, f"v{req.target_version} ({board_type})")
    result = {k: v for k, v in build.items() if k != "_id"}
    return result

@api_router.get("/builds")
async def list_builds(user: dict = Depends(get_current_user)):
    query = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    builds = await db.builds.find(query, {"_id": 0}).sort("started_at", -1).to_list(50)
    return builds

@api_router.get("/builds/{build_id}")
async def get_build(build_id: str, user: dict = Depends(get_current_user)):
    build = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build

# ─── DEPLOY ROUTES ──────────────────────────────────────────────────
@api_router.post("/deployments")
async def create_deployment(req: DeployCreate, user: dict = Depends(require_role("admin", "developer"))):
    build = await db.builds.find_one({"id": req.build_id}, {"_id": 0})
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    if build["status"] != "success":
        raise HTTPException(status_code=400, detail="Build not successful")
    deploy_id = gen_id()
    device_statuses = {}
    for did in req.target_device_ids:
        device_statuses[did] = "pending"
    deploy = {
        "id": deploy_id,
        "build_id": req.build_id,
        "version": build["version"],
        "project_name": build.get("project_name", ""),
        "owner_id": user["id"],
        "target_device_ids": req.target_device_ids,
        "device_statuses": device_statuses,
        "rollout_percent": req.rollout_percent,
        "rollout_strategy": req.rollout_strategy,
        "status": "active",
        "artifact_hash": build.get("artifact_hash", ""),
        "created_at": now_iso(),
    }
    await db.deployments.insert_one(deploy)
    # Update devices with pending OTA
    for did in req.target_device_ids:
        await db.devices.update_one({"id": did}, {"$set": {"last_ota_status": "pending", "pending_deployment_id": deploy_id}})
    await audit_log(user["id"], user["email"], "create_deployment", "deployment", deploy_id, f"v{build['version']} to {len(req.target_device_ids)} devices")
    result = {k: v for k, v in deploy.items() if k != "_id"}
    return result

@api_router.get("/deployments")
async def list_deployments(user: dict = Depends(get_current_user)):
    query = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    deploys = await db.deployments.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return deploys

@api_router.get("/deployments/{deploy_id}")
async def get_deployment(deploy_id: str, user: dict = Depends(get_current_user)):
    deploy = await db.deployments.find_one({"id": deploy_id}, {"_id": 0})
    if not deploy:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return deploy

@api_router.post("/deployments/{deploy_id}/rollback")
async def rollback_deployment(deploy_id: str, req: DeployRollback, user: dict = Depends(require_role("admin", "developer"))):
    deploy = await db.deployments.find_one({"id": deploy_id}, {"_id": 0})
    if not deploy:
        raise HTTPException(status_code=404, detail="Deployment not found")
    await db.deployments.update_one({"id": deploy_id}, {"$set": {"status": "rolled_back", "rollback_reason": req.reason, "rolled_back_at": now_iso()}})
    for did in deploy.get("target_device_ids", []):
        await db.devices.update_one({"id": did}, {"$set": {"last_ota_status": "rolled_back", "pending_deployment_id": ""}})
    await audit_log(user["id"], user["email"], "rollback_deployment", "deployment", deploy_id, req.reason)
    return {"message": "Deployment rolled back"}

@api_router.post("/deployments/{deploy_id}/pause")
async def pause_deployment(deploy_id: str, user: dict = Depends(require_role("admin", "developer"))):
    await db.deployments.update_one({"id": deploy_id}, {"$set": {"status": "paused"}})
    await audit_log(user["id"], user["email"], "pause_deployment", "deployment", deploy_id)
    return {"message": "Deployment paused"}

@api_router.post("/deployments/{deploy_id}/resume")
async def resume_deployment(deploy_id: str, user: dict = Depends(require_role("admin", "developer"))):
    await db.deployments.update_one({"id": deploy_id}, {"$set": {"status": "active"}})
    await audit_log(user["id"], user["email"], "resume_deployment", "deployment", deploy_id)
    return {"message": "Deployment resumed"}

@api_router.put("/deployments/{deploy_id}/rollout")
async def update_rollout(deploy_id: str, rollout_percent: int, user: dict = Depends(require_role("admin", "developer"))):
    if rollout_percent not in [5, 20, 50, 100]:
        raise HTTPException(status_code=400, detail="Rollout percent must be 5, 20, 50, or 100")
    await db.deployments.update_one({"id": deploy_id}, {"$set": {"rollout_percent": rollout_percent}})
    await audit_log(user["id"], user["email"], "update_rollout", "deployment", deploy_id, f"Rollout: {rollout_percent}%")
    return {"message": f"Rollout updated to {rollout_percent}%"}

# ─── OTA DEVICE PULL ROUTES ────────────────────────────────────────
@api_router.post("/ota/check")
async def ota_check_update(req: OTACheckRequest):
    """Device polls this to check for pending OTA updates."""
    device = await db.devices.find_one({"id": req.device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    deploy_id = device.get("pending_deployment_id", "")
    if not deploy_id:
        return {"update_available": False}
    deploy = await db.deployments.find_one({"id": deploy_id}, {"_id": 0})
    if not deploy or deploy["status"] != "active":
        return {"update_available": False}
    return {
        "update_available": True,
        "deployment_id": deploy_id,
        "version": deploy["version"],
        "artifact_hash": deploy.get("artifact_hash", ""),
        "download_url": f"/api/ota/download/{deploy_id}",
    }

@api_router.get("/ota/download/{deploy_id}")
async def ota_download(deploy_id: str):
    """Device downloads firmware binary here."""
    deploy = await db.deployments.find_one({"id": deploy_id}, {"_id": 0})
    if not deploy:
        raise HTTPException(status_code=404, detail="Deployment not found")
    build = await db.builds.find_one({"id": deploy.get("build_id", "")}, {"_id": 0})
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    artifact_file = build.get("artifact_file", "")
    if not artifact_file:
        raise HTTPException(status_code=404, detail="No firmware artifact available")
    artifact_path = ARTIFACTS_DIR / artifact_file
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Artifact file not found on disk")
    return FileResponse(
        str(artifact_path),
        media_type="application/octet-stream",
        filename=f"firmware_v{deploy.get('version', 'unknown')}.bin",
        headers={"X-Artifact-Hash": build.get("artifact_hash", "")},
    )

@api_router.get("/ota/manifest/{build_id}")
async def ota_manifest(build_id: str):
    """Get signed OTA manifest for a build."""
    build = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    manifest = build.get("manifest")
    if not manifest:
        raise HTTPException(status_code=404, detail="No manifest available for this build")
    return manifest

@api_router.get("/ota/public-key")
async def ota_public_key():
    """Return the OTA signing public key for ESP32 verification."""
    pem = get_public_key_pem()
    if not pem:
        raise HTTPException(status_code=404, detail="Public key not configured")
    return {"public_key_pem": pem}

@api_router.post("/ota/report")
async def ota_report_status(device_id: str, status: str, version: str = ""):
    """Device reports OTA status (downloading, applied, success, failed)."""
    update = {"last_ota_status": status}
    if status == "success" and version:
        update["firmware_version"] = version
        update["pending_deployment_id"] = ""
    elif status == "failed":
        update["pending_deployment_id"] = ""
    await db.devices.update_one({"id": device_id}, {"$set": update})
    # Update deployment device status
    deploys = await db.deployments.find({"target_device_ids": device_id, "status": "active"}, {"_id": 0}).to_list(10)
    for d in deploys:
        await db.deployments.update_one(
            {"id": d["id"]},
            {"$set": {f"device_statuses.{device_id}": status}}
        )
    return {"message": "Status reported"}

# ─── TELEMETRY ROUTES ───────────────────────────────────────────────
@api_router.post("/telemetry/heartbeat")
async def telemetry_heartbeat(req: TelemetryHeartbeat):
    """Device sends periodic heartbeat with telemetry data."""
    await db.devices.update_one(
        {"id": req.device_id},
        {"$set": {
            "status": "online",
            "last_seen": now_iso(),
            "rssi": req.rssi,
            "free_heap": req.free_heap,
            "firmware_version": req.firmware_version,
        }}
    )
    telemetry = {
        "id": gen_id(),
        "device_id": req.device_id,
        "rssi": req.rssi,
        "free_heap": req.free_heap,
        "uptime": req.uptime,
        "firmware_version": req.firmware_version,
        "timestamp": now_iso(),
    }
    await db.telemetry.insert_one(telemetry)
    return {"message": "Heartbeat received"}

@api_router.get("/telemetry/dashboard")
async def telemetry_dashboard(user: dict = Depends(get_current_user)):
    """Get fleet-wide telemetry summary."""
    query = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    devices = await db.devices.find(query, {"_id": 0}).to_list(500)
    total = len(devices)
    online = sum(1 for d in devices if d.get("status") == "online")
    offline = total - online
    avg_rssi = 0
    avg_heap = 0
    if total > 0:
        rssi_vals = [d.get("rssi", 0) for d in devices if d.get("rssi")]
        heap_vals = [d.get("free_heap", 0) for d in devices if d.get("free_heap")]
        avg_rssi = sum(rssi_vals) / len(rssi_vals) if rssi_vals else 0
        avg_heap = sum(heap_vals) / len(heap_vals) if heap_vals else 0
    versions = {}
    for d in devices:
        v = d.get("firmware_version", "unknown")
        versions[v] = versions.get(v, 0) + 1
    return {
        "total_devices": total,
        "online": online,
        "offline": offline,
        "avg_rssi": round(avg_rssi, 1),
        "avg_free_heap": round(avg_heap),
        "firmware_versions": versions,
        "devices": devices,
    }

@api_router.get("/telemetry/{device_id}")
async def device_telemetry(device_id: str, user: dict = Depends(get_current_user)):
    """Get recent telemetry for a specific device."""
    records = await db.telemetry.find({"device_id": device_id}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return records

# ─── AUDIT LOG ROUTES ───────────────────────────────────────────────
@api_router.get("/audit-logs")
async def list_audit_logs(limit: int = 100, user: dict = Depends(get_current_user)):
    query = {} if user["role"] == "admin" else {"user_id": user["id"]}
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs

# ─── USER MANAGEMENT ROUTES ────────────────────────────────────────
@api_router.get("/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return users

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, req: UserRoleUpdate, user: dict = Depends(require_role("admin"))):
    if req.role not in ["admin", "developer", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    await db.users.update_one({"id": user_id}, {"$set": {"role": req.role}})
    await audit_log(user["id"], user["email"], "update_role", "user", user_id, f"New role: {req.role}")
    return {"message": f"Role updated to {req.role}"}

# ─── INCLUDE ROUTER & MIDDLEWARE ────────────────────────────────────
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.devices.create_index("id", unique=True)
    await db.devices.create_index("claim_code")
    await db.devices.create_index("owner_id")
    await db.projects.create_index("id", unique=True)
    await db.builds.create_index("id", unique=True)
    await db.deployments.create_index("id", unique=True)
    await db.audit_logs.create_index("timestamp")
    await db.telemetry.create_index([("device_id", 1), ("timestamp", -1)])
    logger.info("ESP32 Fleet Manager API started")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
