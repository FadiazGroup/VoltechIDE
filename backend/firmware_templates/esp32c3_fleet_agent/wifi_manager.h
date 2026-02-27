/**
 * Wi-Fi Manager — Header
 * Handles STA connection, AP mode captive portal, NVS credential storage.
 */

#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    WIFI_CONNECT_OK,
    WIFI_CONNECT_FAIL,
    WIFI_CONNECT_NO_CREDENTIALS,
    WIFI_CONNECT_TIMEOUT,
} wifi_connect_result_t;

/**
 * Initialize Wi-Fi subsystem (call once at startup).
 */
void wifi_manager_init(void);

/**
 * Attempt to connect to saved Wi-Fi credentials.
 * @param timeout_ms  Max time to wait for connection.
 * @return Result code.
 */
wifi_connect_result_t wifi_manager_connect(uint32_t timeout_ms);

/**
 * Check if currently connected to Wi-Fi.
 */
bool wifi_manager_is_connected(void);

/**
 * Get the current IP address string (valid only when connected).
 */
const char* wifi_manager_get_ip(void);

/**
 * Get the current RSSI value (signal strength).
 */
int wifi_manager_get_rssi(void);

/**
 * Start AP mode with captive portal HTTP server.
 * AP SSID will be "ESP32-Setup-XXXX" (last 4 hex of MAC).
 */
void wifi_manager_start_ap_portal(void);

/**
 * Block until the portal receives new credentials or timeout.
 * @param timeout_ms  Max wait time.
 * @return true if new credentials were saved.
 */
bool wifi_manager_wait_for_portal_result(uint32_t timeout_ms);

/**
 * Stop AP mode and portal HTTP server.
 */
void wifi_manager_stop_ap_portal(void);

/**
 * Erase saved Wi-Fi credentials from NVS (force re-provision).
 */
void wifi_manager_erase_credentials(void);
