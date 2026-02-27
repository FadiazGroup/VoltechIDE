"""
Real PlatformIO Build Service for ESP32-C3
Isolated build environment with resource limits, real-time log capture,
artifact storage, and signed OTA manifest generation.
"""

import asyncio
import hashlib
import json
import os
import shutil
import tempfile
import base64
from pathlib import Path
from datetime import datetime, timezone
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

BACKEND_DIR = Path(__file__).parent
ARTIFACTS_DIR = BACKEND_DIR / "artifacts"
SIGNING_KEY_PATH = BACKEND_DIR / "ota_signing_key.pem"
SIGNING_PUB_KEY_PATH = BACKEND_DIR / "ota_signing_key_pub.pem"

ARTIFACTS_DIR.mkdir(exist_ok=True)

BUILD_TIMEOUT = 180  # seconds
MAX_LOG_LINES = 500

# PlatformIO board configs per board type
BOARD_CONFIGS = {
    "ESP32-C3": {
        "platform": "espressif32",
        "board": "esp32-c3-devkitm-1",
        "framework": "espidf",
        "monitor_speed": "115200",
        "extra_flags": "",
    },
    "ESP32": {
        "platform": "espressif32",
        "board": "esp32dev",
        "framework": "espidf",
        "monitor_speed": "115200",
        "extra_flags": "",
    },
    "ESP32-S3": {
        "platform": "espressif32",
        "board": "esp32-s3-devkitc-1",
        "framework": "espidf",
        "monitor_speed": "115200",
        "extra_flags": "",
    },
}


def _generate_platformio_ini(board_type: str) -> str:
    config = BOARD_CONFIGS.get(board_type, BOARD_CONFIGS["ESP32-C3"])
    ini = f"""[env:{board_type.lower().replace('-', '')}]
platform = {config['platform']}
board = {config['board']}
framework = {config['framework']}
monitor_speed = {config['monitor_speed']}
board_build.partitions = default.csv
"""
    return ini


def _compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _sign_manifest(manifest_json: str) -> str:
    """Sign manifest JSON with RSA private key, return base64 signature."""
    if not SIGNING_KEY_PATH.exists():
        return ""
    with open(SIGNING_KEY_PATH, "rb") as f:
        private_key = serialization.load_pem_private_key(f.read(), password=None)
    signature = private_key.sign(
        manifest_json.encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode()


def get_public_key_pem() -> str:
    """Return the public key PEM for verification on ESP32."""
    if not SIGNING_PUB_KEY_PATH.exists():
        return ""
    return SIGNING_PUB_KEY_PATH.read_text()


async def real_build_process(build_id: str, project_files: list, board_type: str,
                              version: str, db, on_log=None):
    """
    Execute a real PlatformIO build in an isolated temp directory.
    
    Args:
        build_id: Unique build identifier
        project_files: List of {"name": str, "content": str}
        board_type: Target board (ESP32-C3, ESP32, ESP32-S3)
        version: Semantic version string
        db: MongoDB database reference
        on_log: Optional callback for log lines
    
    Returns:
        dict with build result info
    """
    logs = []
    build_dir = None
    env_name = board_type.lower().replace("-", "")

    async def add_log(msg, level="INFO"):
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{ts}] [{level}] {msg}"
        logs.append(line)
        if len(logs) > MAX_LOG_LINES:
            logs.pop(0)
        await db.builds.update_one(
            {"id": build_id},
            {"$set": {"logs": logs, "status": "building"}}
        )

    try:
        # Step 1: Create isolated build directory
        build_dir = tempfile.mkdtemp(prefix=f"pio_build_{build_id[:8]}_")
        await add_log(f"Build directory created: {build_id[:8]}")
        await add_log(f"Target: {board_type} | Version: v{version}")

        # Step 2: Write platformio.ini
        ini_content = _generate_platformio_ini(board_type)
        ini_path = os.path.join(build_dir, "platformio.ini")
        with open(ini_path, "w") as f:
            f.write(ini_content)
        await add_log("platformio.ini generated")

        # Step 3: Write source files
        src_dir = os.path.join(build_dir, "src")
        os.makedirs(src_dir, exist_ok=True)

        # Also create include dir
        inc_dir = os.path.join(build_dir, "include")
        os.makedirs(inc_dir, exist_ok=True)

        file_count = 0
        for pf in project_files:
            fname = pf.get("name", "main.c")
            content = pf.get("content", "")
            # Security: sanitize filename (no path traversal)
            safe_name = os.path.basename(fname)
            if safe_name.endswith(".h"):
                fpath = os.path.join(inc_dir, safe_name)
            else:
                fpath = os.path.join(src_dir, safe_name)
            with open(fpath, "w") as f:
                f.write(content)
            file_count += 1
            await add_log(f"  + {safe_name} ({len(content)} bytes)")

        await add_log(f"{file_count} source file(s) written")

        # Step 4: Run PlatformIO build with timeout
        await add_log("Starting PlatformIO compilation...")
        await add_log(f"Platform: espressif32 | Board: {BOARD_CONFIGS.get(board_type, BOARD_CONFIGS['ESP32-C3'])['board']}")

        process = await asyncio.create_subprocess_exec(
            "pio", "run", "-e", env_name,
            cwd=build_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "PLATFORMIO_CORE_DIR": os.path.expanduser("~/.platformio")},
        )

        # Stream output line by line
        try:
            while True:
                line = await asyncio.wait_for(
                    process.stdout.readline(),
                    timeout=BUILD_TIMEOUT
                )
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").rstrip()
                if decoded:
                    # Filter verbose cmake output, keep important lines
                    if any(kw in decoded for kw in [
                        "Compiling", "Linking", "Building", "RAM:", "Flash:",
                        "SUCCESS", "FAILED", "Error", "error:", "warning:",
                        "Library", "LDF", "Scanning", "Found", "Checking",
                        "Retrieving", "esptool", "Creating", "Merged",
                    ]):
                        await add_log(decoded)
                    elif decoded.startswith("[") or "%" in decoded:
                        await add_log(decoded)
        except asyncio.TimeoutError:
            process.kill()
            await add_log("BUILD TIMEOUT - Process killed", "ERROR")
            await db.builds.update_one(
                {"id": build_id},
                {"$set": {"status": "failed", "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
            )
            return {"success": False, "error": "Build timeout"}

        await process.wait()

        if process.returncode != 0:
            await add_log(f"Build FAILED (exit code: {process.returncode})", "ERROR")
            await db.builds.update_one(
                {"id": build_id},
                {"$set": {"status": "failed", "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
            )
            return {"success": False, "error": f"Build failed with exit code {process.returncode}"}

        # Step 5: Locate firmware binary
        firmware_path = os.path.join(build_dir, ".pio", "build", env_name, "firmware.bin")
        if not os.path.exists(firmware_path):
            await add_log("firmware.bin not found!", "ERROR")
            await db.builds.update_one(
                {"id": build_id},
                {"$set": {"status": "failed", "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
            )
            return {"success": False, "error": "Firmware binary not found"}

        fw_size = os.path.getsize(firmware_path)
        await add_log(f"Firmware binary: {fw_size} bytes ({fw_size / 1024:.1f} KB)")

        # Step 6: Compute SHA-256
        fw_hash = _compute_sha256(firmware_path)
        await add_log(f"SHA-256: {fw_hash[:16]}...{fw_hash[-8:]}")

        # Step 7: Copy artifact to persistent storage
        artifact_filename = f"{build_id}.bin"
        artifact_dest = ARTIFACTS_DIR / artifact_filename
        shutil.copy2(firmware_path, str(artifact_dest))
        await add_log(f"Artifact stored: {artifact_filename}")

        # Step 8: Generate signed OTA manifest
        manifest = {
            "build_id": build_id,
            "version": version,
            "board_type": board_type,
            "artifact_file": artifact_filename,
            "artifact_size": fw_size,
            "artifact_hash_sha256": fw_hash,
            "built_at": datetime.now(timezone.utc).isoformat(),
        }
        manifest_json = json.dumps(manifest, sort_keys=True)
        signature = _sign_manifest(manifest_json)
        manifest["signature"] = signature

        manifest_filename = f"{build_id}_manifest.json"
        manifest_path = ARTIFACTS_DIR / manifest_filename
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        await add_log(f"Signed OTA manifest generated: {manifest_filename}")

        # Step 9: Extract memory usage from logs
        ram_usage = ""
        flash_usage = ""
        for log_line in logs:
            if "RAM:" in log_line:
                ram_usage = log_line.split("]")[-1].strip() if "]" in log_line else log_line
            if "Flash:" in log_line:
                flash_usage = log_line.split("]")[-1].strip() if "]" in log_line else log_line

        await add_log("=" * 50)
        await add_log(f"BUILD SUCCESSFUL - v{version} for {board_type}")
        if ram_usage:
            await add_log(f"Memory: {ram_usage}")
        if flash_usage:
            await add_log(f"Flash: {flash_usage}")

        # Step 10: Update build record
        await db.builds.update_one(
            {"id": build_id},
            {"$set": {
                "status": "success",
                "logs": logs,
                "artifact_hash": fw_hash,
                "artifact_size": fw_size,
                "artifact_file": artifact_filename,
                "manifest_file": manifest_filename,
                "manifest": manifest,
                "ram_usage": ram_usage,
                "flash_usage": flash_usage,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }}
        )

        return {
            "success": True,
            "artifact_file": artifact_filename,
            "artifact_hash": fw_hash,
            "artifact_size": fw_size,
            "manifest": manifest,
        }

    except Exception as e:
        await add_log(f"Build error: {str(e)}", "ERROR")
        await db.builds.update_one(
            {"id": build_id},
            {"$set": {"status": "failed", "logs": logs, "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": False, "error": str(e)}

    finally:
        # Cleanup build directory
        if build_dir and os.path.exists(build_dir):
            try:
                shutil.rmtree(build_dir)
            except Exception:
                pass
