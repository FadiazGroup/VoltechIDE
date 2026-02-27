# ESP32 Web IDE + Pin Config + OTA Firmware Deployment

## Problem Statement
Sistem "ESP32 Web IDE + Pin Config + OTA Firmware Deployment" berbasis website, dengan fokus reliability dan security untuk production kecil-menengah. Fitur utama: device management, pin configurator (like STM32CubeMX), code editor, OTA deployment, telemetry dashboard, RBAC, audit logging.

## Architecture
- **Frontend**: React 19 + Shadcn UI + Monaco Editor + Recharts + Tailwind CSS
- **Backend**: FastAPI + Motor (async MongoDB driver)
- **Database**: MongoDB
- **Auth**: JWT-based with bcrypt password hashing
- **Theme**: Cyber-industrial dark theme (Space Grotesk + JetBrains Mono)

## User Personas
1. **Admin**: Full system access, user management, RBAC
2. **Developer**: Device management, pin config, code editing, build & deploy
3. **Viewer**: Read-only access to dashboard, OTA history, audit logs

## Core Requirements
- JWT authentication with RBAC (admin/developer/viewer)
- Device registry with claim flow (6-digit pairing code)
- ESP32-C3 pin configurator with hardware validation rules
- Monaco-based code editor with project management
- Build service (MOCKED for MVP) with terminal logs
- OTA deployment with staged rollout (5%/20%/50%/100%)
- Telemetry dashboard (online/offline, RSSI, free_heap)
- Comprehensive audit logging
- Deployment pause/resume/rollback

## What's Been Implemented (Phase 1 MVP - Feb 2026)
- [x] JWT auth (register/login/me) with RBAC
- [x] Device CRUD + claim flow with pairing codes
- [x] ESP32-C3 pin configurator with 22 GPIO pins, validation engine
- [x] Monaco code editor with project/file management
- [x] OTA deployment with staged rollout (canary)
- [x] Deployment pause/resume/rollback
- [x] Telemetry dashboard with Recharts visualizations
- [x] Audit log with full activity tracking
- [x] User management with RBAC (admin settings page)
- [x] Dark cyber-industrial UI theme

## What's Been Implemented (Phase 2 - Feb 2026)
- [x] Real PlatformIO/ESP-IDF build service (replaces mock)
- [x] ESP32-C3 firmware compilation via PlatformIO (espressif32 platform)
- [x] Real firmware .bin artifact generation and storage
- [x] SHA-256 hash computation for all artifacts
- [x] RSA-2048 signed OTA manifests (private key signing + public key endpoint)
- [x] OTA download endpoint serving real firmware binaries
- [x] Build terminal shows real compilation output (compiling, linking, memory usage)
- [x] Artifact info panel (version, size, SHA-256, memory stats, manifest status)
- [x] Build timeout protection (180s max)
- [x] Isolated temp directory per build with cleanup

## Prioritized Backlog

### P0 (Critical)
- ESP32 firmware agent state machine code
- Dual OTA partition + rollback on health-check fail
- AP provisioning with captive portal (ESP32 side)

### P1 (High)
- Device heartbeat with WebSocket real-time updates
- NVS encrypted Wi-Fi credential storage
- Board profile engine (ESP32/ESP32-S3/C3) with per-board rules
- Docker sandbox container isolation for builds

### P2 (Medium)
- Board profile engine (ESP32/ESP32-S3/C3) with per-board rules
- Rate limiting on API endpoints
- API token/key management for device auth
- Firmware version immutable artifacts with semver enforcement
- Build artifact S3/cloud storage

### P3 (Nice to Have)
- Multi-user organization support
- Webhook notifications (build complete, deploy status)
- Device grouping and tagging
- Bulk OTA deployment
- CI/CD integration

## Next Tasks
1. Phase 2: Real PlatformIO build service in container sandbox
2. Signed OTA manifest implementation
3. ESP32 firmware agent skeleton code
4. WebSocket-based real-time device status
5. Board profile engine for ESP32/ESP32-S3
