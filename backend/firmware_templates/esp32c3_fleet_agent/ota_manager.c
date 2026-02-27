/**
 * OTA Manager — Implementation
 * Device-pull OTA with SHA-256 verification and dual-partition support.
 */

#include "ota_manager.h"

#include <string.h>
#include <stdlib.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_http_client.h"
#include "esp_partition.h"
#include "mbedtls/sha256.h"
#include "cJSON.h"

static const char *TAG = "OTA_MGR";

/* ── Configuration ── adjust SERVER_BASE_URL to your fleet server ─ */
#ifndef OTA_SERVER_BASE_URL
#define OTA_SERVER_BASE_URL  "https://your-server.com"
#endif

#ifndef OTA_DEVICE_ID
#define OTA_DEVICE_ID        "REPLACE_WITH_DEVICE_ID"
#endif

/* ── Internal State ───────────────────────────────────────────── */
static esp_ota_handle_t       s_ota_handle    = 0;
static const esp_partition_t *s_update_part   = NULL;
static mbedtls_sha256_context s_sha_ctx;
static bool                   s_download_active = false;

/* ── Helpers ──────────────────────────────────────────────────── */

/* Convert binary hash to hex string */
static void hash_to_hex(const uint8_t *hash, char *hex_out, size_t hash_len)
{
    for (size_t i = 0; i < hash_len; i++) {
        sprintf(hex_out + i * 2, "%02x", hash[i]);
    }
    hex_out[hash_len * 2] = 0;
}

/* ── Public API ───────────────────────────────────────────────── */

void ota_manager_init(void)
{
    ESP_LOGI(TAG, "OTA manager initialized");
    ESP_LOGI(TAG, "Running partition: %s",
             esp_ota_get_running_partition()->label);

    const esp_partition_t *boot = esp_ota_get_boot_partition();
    const esp_partition_t *run  = esp_ota_get_running_partition();
    if (boot != run) {
        ESP_LOGW(TAG, "Boot partition (%s) != running partition (%s)",
                 boot->label, run->label);
    }
}

ota_check_result_t ota_manager_check_update(const char *current_version,
                                             ota_update_info_t *out_info)
{
    char url[512];
    snprintf(url, sizeof(url), "%s/api/ota/check", OTA_SERVER_BASE_URL);

    /* Build JSON body */
    char body[256];
    snprintf(body, sizeof(body),
             "{\"device_id\":\"%s\",\"current_version\":\"%s\"}",
             OTA_DEVICE_ID, current_version);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 10000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body, strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA check HTTP error: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return OTA_CHECK_ERROR;
    }

    int status = esp_http_client_get_status_code(client);
    int content_len = esp_http_client_get_content_length(client);

    if (status != 200 || content_len <= 0 || content_len > 2048) {
        ESP_LOGW(TAG, "OTA check: status=%d len=%d", status, content_len);
        esp_http_client_cleanup(client);
        return OTA_CHECK_ERROR;
    }

    char *response = calloc(1, content_len + 1);
    if (!response) {
        esp_http_client_cleanup(client);
        return OTA_CHECK_ERROR;
    }

    /* Re-read response body */
    esp_http_client_cleanup(client);

    /* For simplicity, use a second request with esp_http_client_read */
    client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body, strlen(body));

    err = esp_http_client_open(client, strlen(body));
    if (err != ESP_OK) {
        free(response);
        esp_http_client_cleanup(client);
        return OTA_CHECK_ERROR;
    }
    esp_http_client_write(client, body, strlen(body));

    content_len = esp_http_client_fetch_headers(client);
    if (content_len > 0) {
        esp_http_client_read(client, response, content_len);
    }
    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    /* Parse JSON response */
    cJSON *json = cJSON_Parse(response);
    free(response);
    if (!json) {
        ESP_LOGE(TAG, "OTA check: JSON parse failed");
        return OTA_CHECK_ERROR;
    }

    cJSON *update_avail = cJSON_GetObjectItem(json, "update_available");
    if (!cJSON_IsTrue(update_avail)) {
        cJSON_Delete(json);
        return OTA_NO_UPDATE;
    }

    /* Extract update info */
    cJSON *ver  = cJSON_GetObjectItem(json, "version");
    cJSON *hash = cJSON_GetObjectItem(json, "artifact_hash");
    cJSON *dl   = cJSON_GetObjectItem(json, "download_url");
    cJSON *did  = cJSON_GetObjectItem(json, "deployment_id");

    if (ver && ver->valuestring)
        strncpy(out_info->version, ver->valuestring, OTA_MAX_VERSION_LEN - 1);
    if (hash && hash->valuestring)
        strncpy(out_info->artifact_hash, hash->valuestring, OTA_MAX_HASH_LEN - 1);
    if (dl && dl->valuestring) {
        /* Build full download URL */
        snprintf(out_info->download_url, OTA_MAX_URL_LEN,
                 "%s%s", OTA_SERVER_BASE_URL, dl->valuestring);
    }
    if (did && did->valuestring)
        strncpy(out_info->deployment_id, did->valuestring, sizeof(out_info->deployment_id) - 1);

    cJSON_Delete(json);

    ESP_LOGI(TAG, "Update available: v%s", out_info->version);
    return OTA_UPDATE_AVAILABLE;
}

ota_download_result_t ota_manager_download(const ota_update_info_t *info)
{
    ESP_LOGI(TAG, "Downloading from: %s", info->download_url);

    s_update_part = esp_ota_get_next_update_partition(NULL);
    if (!s_update_part) {
        ESP_LOGE(TAG, "No OTA partition available");
        return OTA_DOWNLOAD_FAIL;
    }
    ESP_LOGI(TAG, "Writing to partition: %s (offset=0x%lx, size=%lu)",
             s_update_part->label,
             (unsigned long)s_update_part->address,
             (unsigned long)s_update_part->size);

    esp_err_t err = esp_ota_begin(s_update_part, OTA_WITH_SEQUENTIAL_WRITES, &s_ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_ota_begin failed: %s", esp_err_to_name(err));
        return OTA_DOWNLOAD_FAIL;
    }

    /* Initialize SHA-256 context for verification */
    mbedtls_sha256_init(&s_sha_ctx);
    mbedtls_sha256_starts(&s_sha_ctx, 0); /* 0 = SHA-256 (not SHA-224) */
    s_download_active = true;

    /* HTTP download */
    esp_http_client_config_t config = {
        .url = info->download_url,
        .timeout_ms = 30000,
        .buffer_size = 4096,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HTTP open failed: %s", esp_err_to_name(err));
        esp_ota_abort(s_ota_handle);
        esp_http_client_cleanup(client);
        s_download_active = false;
        return OTA_DOWNLOAD_FAIL;
    }

    int content_len = esp_http_client_fetch_headers(client);
    ESP_LOGI(TAG, "Content length: %d bytes", content_len);

    char *buf = malloc(4096);
    if (!buf) {
        esp_ota_abort(s_ota_handle);
        esp_http_client_cleanup(client);
        s_download_active = false;
        return OTA_DOWNLOAD_FAIL;
    }

    int total = 0;
    int read_len;
    while ((read_len = esp_http_client_read(client, buf, 4096)) > 0) {
        err = esp_ota_write(s_ota_handle, buf, read_len);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "esp_ota_write failed: %s", esp_err_to_name(err));
            free(buf);
            esp_ota_abort(s_ota_handle);
            esp_http_client_cleanup(client);
            s_download_active = false;
            return OTA_DOWNLOAD_FAIL;
        }

        /* Update SHA-256 hash */
        mbedtls_sha256_update(&s_sha_ctx, (uint8_t *)buf, read_len);

        total += read_len;
        if (total % (64 * 1024) == 0) {
            ESP_LOGI(TAG, "Downloaded %d bytes...", total);
        }
    }

    free(buf);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    ESP_LOGI(TAG, "Download complete: %d bytes total", total);
    return OTA_DOWNLOAD_OK;
}

bool ota_manager_verify_hash(const ota_update_info_t *info)
{
    if (!s_download_active) return false;

    uint8_t hash[32];
    mbedtls_sha256_finish(&s_sha_ctx, hash);
    mbedtls_sha256_free(&s_sha_ctx);

    char hex_hash[65];
    hash_to_hex(hash, hex_hash, 32);

    ESP_LOGI(TAG, "Computed SHA-256: %s", hex_hash);
    ESP_LOGI(TAG, "Expected SHA-256: %s", info->artifact_hash);

    bool match = (strcasecmp(hex_hash, info->artifact_hash) == 0);
    if (!match) {
        ESP_LOGE(TAG, "HASH MISMATCH!");
    }
    return match;
}

bool ota_manager_apply(void)
{
    if (!s_download_active || !s_update_part) return false;

    esp_err_t err = esp_ota_end(s_ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_ota_end failed: %s", esp_err_to_name(err));
        s_download_active = false;
        return false;
    }

    err = esp_ota_set_boot_partition(s_update_part);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_ota_set_boot_partition failed: %s", esp_err_to_name(err));
        s_download_active = false;
        return false;
    }

    ESP_LOGI(TAG, "OTA applied. Next boot from: %s", s_update_part->label);
    s_download_active = false;
    return true;
}

void ota_manager_abort(void)
{
    if (s_download_active && s_ota_handle) {
        esp_ota_abort(s_ota_handle);
        s_download_active = false;
        ESP_LOGW(TAG, "OTA aborted");
    }
}

bool ota_manager_server_reachable(void)
{
    char url[256];
    snprintf(url, sizeof(url), "%s/api/ota/public-key", OTA_SERVER_BASE_URL);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 5000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    return (err == ESP_OK && status == 200);
}
