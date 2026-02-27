/**
 * Device Agent — Header
 * Handles device registration, telemetry heartbeat, and OTA status reporting.
 */

#pragma once

#include <stdbool.h>

/**
 * Initialize device agent (loads device_id from NVS or generates new).
 */
void device_agent_init(void);

/**
 * Get the device ID.
 */
const char* device_agent_get_id(void);

/**
 * Send telemetry heartbeat to server.
 * Reports: RSSI, free_heap, uptime, firmware_version.
 */
void device_agent_send_heartbeat(const char *firmware_version);

/**
 * Report device online/offline status.
 */
void device_agent_report_status(const char *status);

/**
 * Report OTA progress status (downloading, applied, success, failed).
 */
void device_agent_report_ota_status(const char *status);
