/**
 * Device Agent — Implementation
 * Telemetry heartbeat, status reporting, device identity management.
 */

#include "device_agent.h"

#include <string.h>
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_http_client.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "nvs.h"

#include "wifi_manager.h"

static const char *TAG = "DEV_AGENT";

/* ── Configuration ── adjust to your fleet server ─────────────── */
#ifndef OTA_SERVER_BASE_URL
#define OTA_SERVER_BASE_URL  "https://your-server.com"
#endif

#ifndef OTA_DEVICE_ID
#define OTA_DEVICE_ID        "REPLACE_WITH_DEVICE_ID"
#endif

#define NVS_NAMESPACE_DEVICE "device_cfg"
#define NVS_KEY_DEVICE_ID    "device_id"

static char s_device_id[64] = {0};
static int64_t s_boot_time_us = 0;

/* ── Helpers ──────────────────────────────────────────────────── */

static void http_post_json(const char *path, const char *json_body)
{
    char url[256];
    snprintf(url, sizeof(url), "%s%s", OTA_SERVER_BASE_URL, path);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 10000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, json_body, strlen(json_body));

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "HTTP POST %s failed: %s", path, esp_err_to_name(err));
    }
    esp_http_client_cleanup(client);
}

/* ── Public API ───────────────────────────────────────────────── */

void device_agent_init(void)
{
    s_boot_time_us = esp_timer_get_time();

    /* Load or use compile-time device ID */
    strncpy(s_device_id, OTA_DEVICE_ID, sizeof(s_device_id) - 1);

    /* Optionally load from NVS (allows runtime override) */
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE_DEVICE, NVS_READONLY, &h) == ESP_OK) {
        size_t len = sizeof(s_device_id);
        if (nvs_get_str(h, NVS_KEY_DEVICE_ID, s_device_id, &len) == ESP_OK) {
            ESP_LOGI(TAG, "Device ID from NVS: %s", s_device_id);
        }
        nvs_close(h);
    }

    ESP_LOGI(TAG, "Device agent initialized | ID: %s", s_device_id);
}

const char* device_agent_get_id(void)
{
    return s_device_id;
}

void device_agent_send_heartbeat(const char *firmware_version)
{
    int rssi = wifi_manager_get_rssi();
    uint32_t free_heap = esp_get_free_heap_size();
    int64_t uptime_us = esp_timer_get_time() - s_boot_time_us;
    uint32_t uptime_sec = (uint32_t)(uptime_us / 1000000);

    char body[512];
    snprintf(body, sizeof(body),
        "{"
        "\"device_id\":\"%s\","
        "\"firmware_version\":\"%s\","
        "\"rssi\":%d,"
        "\"free_heap\":%lu,"
        "\"uptime\":%lu"
        "}",
        s_device_id,
        firmware_version,
        rssi,
        (unsigned long)free_heap,
        (unsigned long)uptime_sec);

    ESP_LOGI(TAG, "Heartbeat: RSSI=%d, heap=%lu, uptime=%lus",
             rssi, (unsigned long)free_heap, (unsigned long)uptime_sec);

    http_post_json("/api/telemetry/heartbeat", body);
}

void device_agent_report_status(const char *status)
{
    ESP_LOGI(TAG, "Status: %s", status);
    /* Status is implicitly reported via heartbeat (device goes online) */
}

void device_agent_report_ota_status(const char *status)
{
    char url[256];
    snprintf(url, sizeof(url),
        "/api/ota/report?device_id=%s&status=%s&version=",
        s_device_id, status);

    ESP_LOGI(TAG, "OTA status: %s", status);
    http_post_json(url, "{}");
}
