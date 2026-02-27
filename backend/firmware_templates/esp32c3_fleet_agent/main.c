/**
 * ESP32-C3 Fleet Agent — Main Entry Point
 * 
 * State Machine:
 *   BOOT -> WIFI_CONNECT -> (ok) -> IDLE -> CHECK_UPDATE -> DOWNLOAD -> VERIFY -> APPLY -> REBOOT
 *                        -> (fail) -> AP_PORTAL -> (creds saved) -> WIFI_CONNECT
 *   After reboot: HEALTH_CHECK -> COMMIT | ROLLBACK
 * 
 * Features:
 *   - Wi-Fi provisioning with AP captive portal fallback
 *   - OTA firmware updates (device-pull model)
 *   - SHA-256 artifact verification
 *   - Dual OTA partition with automatic rollback
 *   - Telemetry heartbeat (RSSI, free_heap, uptime)
 *   - Device claim flow (pairing code)
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_log.h"
#include "esp_event.h"
#include "nvs_flash.h"
#include "esp_ota_ops.h"
#include "esp_app_format.h"

#include "wifi_manager.h"
#include "ota_manager.h"
#include "device_agent.h"

static const char *TAG = "MAIN";

/* ── Configuration ────────────────────────────────────────────── */
#define FIRMWARE_VERSION        "1.0.0"
#define OTA_CHECK_INTERVAL_MS   (60 * 1000)   /* Check for OTA every 60s   */
#define HEARTBEAT_INTERVAL_MS   (30 * 1000)   /* Send telemetry every 30s  */
#define WIFI_CONNECT_TIMEOUT_MS (15 * 1000)   /* Wi-Fi connect timeout     */
#define AP_PORTAL_TIMEOUT_MS    (300 * 1000)  /* AP portal timeout (5 min) */
#define HEALTH_CHECK_HEAP_MIN   (32 * 1024)   /* Minimum 32KB free heap    */

/* ── Agent State Machine ──────────────────────────────────────── */
typedef enum {
    STATE_BOOT,
    STATE_WIFI_CONNECT,
    STATE_AP_PORTAL,
    STATE_IDLE,
    STATE_CHECK_UPDATE,
    STATE_DOWNLOAD,
    STATE_VERIFY,
    STATE_APPLY,
    STATE_HEALTH_CHECK,
} agent_state_t;

static const char* state_name(agent_state_t s) {
    switch (s) {
        case STATE_BOOT:         return "BOOT";
        case STATE_WIFI_CONNECT: return "WIFI_CONNECT";
        case STATE_AP_PORTAL:    return "AP_PORTAL";
        case STATE_IDLE:         return "IDLE";
        case STATE_CHECK_UPDATE: return "CHECK_UPDATE";
        case STATE_DOWNLOAD:     return "DOWNLOAD";
        case STATE_VERIFY:       return "VERIFY";
        case STATE_APPLY:        return "APPLY";
        case STATE_HEALTH_CHECK: return "HEALTH_CHECK";
        default:                 return "UNKNOWN";
    }
}

/* ── Health Check (post-OTA reboot) ───────────────────────────── */
static bool perform_health_check(void)
{
    ESP_LOGI(TAG, "Running post-OTA health check...");

    /* Check 1: Sufficient free heap */
    uint32_t free_heap = esp_get_free_heap_size();
    if (free_heap < HEALTH_CHECK_HEAP_MIN) {
        ESP_LOGE(TAG, "Health check FAIL: free_heap=%lu < %d",
                 (unsigned long)free_heap, HEALTH_CHECK_HEAP_MIN);
        return false;
    }

    /* Check 2: Wi-Fi connectivity */
    if (!wifi_manager_is_connected()) {
        ESP_LOGE(TAG, "Health check FAIL: Wi-Fi not connected");
        return false;
    }

    /* Check 3: Can reach OTA server (simple HTTP check) */
    if (!ota_manager_server_reachable()) {
        ESP_LOGW(TAG, "Health check WARN: OTA server unreachable (non-fatal)");
        /* Non-fatal — network may be temporarily down */
    }

    ESP_LOGI(TAG, "Health check PASSED (heap=%lu)", (unsigned long)free_heap);
    return true;
}

/* ── Main State Machine Task ──────────────────────────────────── */
static void agent_task(void *pvParameters)
{
    agent_state_t state = STATE_BOOT;
    ota_update_info_t update_info = {0};
    TickType_t last_heartbeat = 0;
    TickType_t last_ota_check = 0;

    while (1) {
        ESP_LOGI(TAG, ">> State: %s", state_name(state));

        switch (state) {

        /* ─── BOOT ───────────────────────────────────────────── */
        case STATE_BOOT: {
            ESP_LOGI(TAG, "Firmware v%s | Chip: ESP32-C3", FIRMWARE_VERSION);
            ESP_LOGI(TAG, "Free heap: %lu bytes", (unsigned long)esp_get_free_heap_size());

            /* Check if this is a pending-verify OTA boot */
            const esp_partition_t *running = esp_ota_get_running_partition();
            esp_ota_img_states_t ota_state;
            if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK) {
                if (ota_state == ESP_OTA_IMG_PENDING_VERIFY) {
                    ESP_LOGW(TAG, "OTA pending verification — jumping to HEALTH_CHECK");
                    state = STATE_HEALTH_CHECK;
                    break;
                }
            }

            state = STATE_WIFI_CONNECT;
            break;
        }

        /* ─── WIFI_CONNECT ───────────────────────────────────── */
        case STATE_WIFI_CONNECT: {
            ESP_LOGI(TAG, "Connecting to saved Wi-Fi...");
            wifi_connect_result_t result = wifi_manager_connect(WIFI_CONNECT_TIMEOUT_MS);

            if (result == WIFI_CONNECT_OK) {
                ESP_LOGI(TAG, "Wi-Fi connected! IP: %s", wifi_manager_get_ip());
                device_agent_report_status("online");
                state = STATE_IDLE;
            } else if (result == WIFI_CONNECT_NO_CREDENTIALS) {
                ESP_LOGW(TAG, "No saved Wi-Fi credentials");
                state = STATE_AP_PORTAL;
            } else {
                ESP_LOGW(TAG, "Wi-Fi connect failed — starting AP portal");
                state = STATE_AP_PORTAL;
            }
            break;
        }

        /* ─── AP_PORTAL ──────────────────────────────────────── */
        case STATE_AP_PORTAL: {
            ESP_LOGI(TAG, "Starting AP mode + captive portal...");
            wifi_manager_start_ap_portal();

            /* Block until credentials are saved or timeout */
            bool got_creds = wifi_manager_wait_for_portal_result(AP_PORTAL_TIMEOUT_MS);

            wifi_manager_stop_ap_portal();

            if (got_creds) {
                ESP_LOGI(TAG, "New credentials received — retrying Wi-Fi");
                state = STATE_WIFI_CONNECT;
            } else {
                ESP_LOGW(TAG, "AP portal timeout — retrying in 10s");
                vTaskDelay(pdMS_TO_TICKS(10000));
                state = STATE_AP_PORTAL;
            }
            break;
        }

        /* ─── IDLE ───────────────────────────────────────────── */
        case STATE_IDLE: {
            TickType_t now = xTaskGetTickCount();

            /* Periodic heartbeat */
            if ((now - last_heartbeat) >= pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS)) {
                device_agent_send_heartbeat(FIRMWARE_VERSION);
                last_heartbeat = now;
            }

            /* Periodic OTA check */
            if ((now - last_ota_check) >= pdMS_TO_TICKS(OTA_CHECK_INTERVAL_MS)) {
                state = STATE_CHECK_UPDATE;
                last_ota_check = now;
                break;
            }

            /* Check Wi-Fi still connected */
            if (!wifi_manager_is_connected()) {
                ESP_LOGW(TAG, "Wi-Fi lost — reconnecting");
                state = STATE_WIFI_CONNECT;
                break;
            }

            vTaskDelay(pdMS_TO_TICKS(1000));
            break;
        }

        /* ─── CHECK_UPDATE ───────────────────────────────────── */
        case STATE_CHECK_UPDATE: {
            ESP_LOGI(TAG, "Checking for OTA updates...");
            memset(&update_info, 0, sizeof(update_info));

            ota_check_result_t check = ota_manager_check_update(
                FIRMWARE_VERSION, &update_info);

            if (check == OTA_UPDATE_AVAILABLE) {
                ESP_LOGI(TAG, "Update available: v%s (size=%d, hash=%s)",
                         update_info.version,
                         update_info.artifact_size,
                         update_info.artifact_hash);
                state = STATE_DOWNLOAD;
            } else if (check == OTA_NO_UPDATE) {
                ESP_LOGI(TAG, "Firmware is up to date");
                state = STATE_IDLE;
            } else {
                ESP_LOGW(TAG, "OTA check failed (server unreachable?)");
                state = STATE_IDLE;
            }
            break;
        }

        /* ─── DOWNLOAD ───────────────────────────────────────── */
        case STATE_DOWNLOAD: {
            ESP_LOGI(TAG, "Downloading firmware v%s...", update_info.version);
            device_agent_report_ota_status("downloading");

            ota_download_result_t dl = ota_manager_download(&update_info);

            if (dl == OTA_DOWNLOAD_OK) {
                ESP_LOGI(TAG, "Download complete");
                state = STATE_VERIFY;
            } else {
                ESP_LOGE(TAG, "Download failed");
                device_agent_report_ota_status("failed");
                state = STATE_IDLE;
            }
            break;
        }

        /* ─── VERIFY ─────────────────────────────────────────── */
        case STATE_VERIFY: {
            ESP_LOGI(TAG, "Verifying firmware hash...");

            if (ota_manager_verify_hash(&update_info)) {
                ESP_LOGI(TAG, "SHA-256 verification PASSED");
                state = STATE_APPLY;
            } else {
                ESP_LOGE(TAG, "SHA-256 verification FAILED — aborting OTA");
                device_agent_report_ota_status("failed");
                ota_manager_abort();
                state = STATE_IDLE;
            }
            break;
        }

        /* ─── APPLY ──────────────────────────────────────────── */
        case STATE_APPLY: {
            ESP_LOGI(TAG, "Applying OTA update...");

            if (ota_manager_apply()) {
                ESP_LOGI(TAG, "OTA applied — rebooting in 3s...");
                device_agent_report_ota_status("applied");
                vTaskDelay(pdMS_TO_TICKS(3000));
                esp_restart();
                /* Does not return */
            } else {
                ESP_LOGE(TAG, "OTA apply failed");
                device_agent_report_ota_status("failed");
                state = STATE_IDLE;
            }
            break;
        }

        /* ─── HEALTH_CHECK ───────────────────────────────────── */
        case STATE_HEALTH_CHECK: {
            /* First, connect Wi-Fi (needed for health check) */
            wifi_connect_result_t wr = wifi_manager_connect(WIFI_CONNECT_TIMEOUT_MS);
            if (wr != WIFI_CONNECT_OK) {
                ESP_LOGE(TAG, "Health check: Wi-Fi failed — ROLLBACK");
                esp_ota_mark_app_invalid_rollback_and_reboot();
                /* Does not return */
            }

            if (perform_health_check()) {
                ESP_LOGI(TAG, "Marking OTA as valid (COMMIT)");
                esp_ota_mark_app_valid_cancel_rollback();
                device_agent_report_ota_status("success");
                state = STATE_IDLE;
            } else {
                ESP_LOGE(TAG, "Health check FAILED — ROLLBACK");
                device_agent_report_ota_status("failed");
                esp_ota_mark_app_invalid_rollback_and_reboot();
                /* Does not return */
            }
            break;
        }

        default:
            ESP_LOGE(TAG, "Unknown state — resetting to BOOT");
            state = STATE_BOOT;
            break;
        }
    }
}

/* ── Application Entry Point ──────────────────────────────────── */
void app_main(void)
{
    ESP_LOGI(TAG, "=== ESP32-C3 Fleet Agent v%s ===", FIRMWARE_VERSION);

    /* Initialize NVS (required for Wi-Fi + credential storage) */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS: erasing and re-init");
        nvs_flash_erase();
        nvs_flash_init();
    }

    /* Initialize default event loop */
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    /* Initialize subsystems */
    wifi_manager_init();
    ota_manager_init();
    device_agent_init();

    /* Start the state machine task */
    xTaskCreate(agent_task, "agent_task", 8192, NULL, 5, NULL);
}
