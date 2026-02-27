/**
 * OTA Manager — Header
 * Handles OTA update checking, downloading, verification, and application.
 */

#pragma once

#include <stdbool.h>
#include <stdint.h>

#define OTA_MAX_VERSION_LEN  32
#define OTA_MAX_HASH_LEN     65
#define OTA_MAX_URL_LEN      256

typedef struct {
    char     version[OTA_MAX_VERSION_LEN];
    char     artifact_hash[OTA_MAX_HASH_LEN];   /* SHA-256 hex string */
    char     download_url[OTA_MAX_URL_LEN];
    char     deployment_id[64];
    uint32_t artifact_size;
} ota_update_info_t;

typedef enum {
    OTA_UPDATE_AVAILABLE,
    OTA_NO_UPDATE,
    OTA_CHECK_ERROR,
} ota_check_result_t;

typedef enum {
    OTA_DOWNLOAD_OK,
    OTA_DOWNLOAD_FAIL,
    OTA_DOWNLOAD_TIMEOUT,
} ota_download_result_t;

/**
 * Initialize OTA subsystem.
 */
void ota_manager_init(void);

/**
 * Check server for available updates.
 * @param current_version  Current firmware version string.
 * @param out_info         Filled with update info if available.
 * @return OTA_UPDATE_AVAILABLE, OTA_NO_UPDATE, or OTA_CHECK_ERROR.
 */
ota_check_result_t ota_manager_check_update(const char *current_version,
                                             ota_update_info_t *out_info);

/**
 * Download firmware to the next OTA partition.
 * @param info  Update info from check_update.
 * @return OTA_DOWNLOAD_OK or OTA_DOWNLOAD_FAIL.
 */
ota_download_result_t ota_manager_download(const ota_update_info_t *info);

/**
 * Verify the downloaded firmware's SHA-256 hash.
 * @param info  Update info containing expected hash.
 * @return true if hash matches.
 */
bool ota_manager_verify_hash(const ota_update_info_t *info);

/**
 * Finalize OTA: set next boot partition and mark as pending verify.
 * Caller should reboot after this returns true.
 * @return true on success.
 */
bool ota_manager_apply(void);

/**
 * Abort a partially downloaded OTA.
 */
void ota_manager_abort(void);

/**
 * Test if OTA server is reachable (HTTP HEAD).
 */
bool ota_manager_server_reachable(void);
