/**
 * Wi-Fi Manager — Implementation
 * STA mode connection + AP captive portal + NVS encrypted credential storage.
 */

#include "wifi_manager.h"

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "nvs_flash.h"
#include "nvs.h"

static const char *TAG = "WIFI_MGR";

/* ── NVS Namespace & Keys ─────────────────────────────────────── */
#define NVS_NAMESPACE   "wifi_creds"
#define NVS_KEY_SSID    "ssid"
#define NVS_KEY_PASS    "password"

/* ── Event Group Bits ─────────────────────────────────────────── */
#define WIFI_CONNECTED_BIT   BIT0
#define WIFI_FAIL_BIT        BIT1
#define PORTAL_DONE_BIT      BIT2

static EventGroupHandle_t s_wifi_events;
static esp_netif_t       *s_sta_netif   = NULL;
static esp_netif_t       *s_ap_netif    = NULL;
static httpd_handle_t     s_portal_http = NULL;
static char               s_ip_addr[16] = "0.0.0.0";
static bool               s_connected   = false;

/* ── Captive Portal HTML ──────────────────────────────────────── */
static const char PORTAL_HTML[] =
    "<!DOCTYPE html><html><head>"
    "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>ESP32-C3 Wi-Fi Setup</title>"
    "<style>"
    "body{font-family:monospace;background:#09090b;color:#ededed;display:flex;"
    "justify-content:center;align-items:center;min-height:100vh;margin:0}"
    ".card{background:#121212;border:1px solid #27272a;border-radius:4px;padding:24px;"
    "width:320px;box-shadow:0 0 20px rgba(0,240,255,0.1)}"
    "h2{color:#00f0ff;font-size:14px;text-transform:uppercase;letter-spacing:2px;"
    "margin:0 0 16px 0;text-align:center}"
    "label{display:block;font-size:10px;color:#a1a1aa;text-transform:uppercase;"
    "letter-spacing:1px;margin:12px 0 4px}"
    "input{width:100%;padding:8px;background:#09090b;border:1px solid #27272a;"
    "color:#ededed;font-family:monospace;font-size:13px;border-radius:2px;"
    "box-sizing:border-box}"
    "input:focus{outline:none;border-color:#00f0ff}"
    "button{width:100%;padding:10px;margin-top:16px;background:rgba(0,240,255,0.1);"
    "border:1px solid rgba(0,240,255,0.5);color:#00f0ff;font-family:monospace;"
    "font-size:11px;text-transform:uppercase;letter-spacing:2px;cursor:pointer;"
    "border-radius:2px}"
    "button:hover{background:rgba(0,240,255,0.2)}"
    ".status{text-align:center;font-size:11px;color:#00ff9d;margin-top:12px}"
    "</style></head><body>"
    "<div class='card'>"
    "<h2>Wi-Fi Setup</h2>"
    "<form method='POST' action='/save'>"
    "<label>SSID (Network Name)</label>"
    "<input type='text' name='ssid' required maxlength='32' placeholder='Your Wi-Fi network'>"
    "<label>Password</label>"
    "<input type='password' name='password' maxlength='64' placeholder='Wi-Fi password'>"
    "<button type='submit'>Connect</button>"
    "</form>"
    "<div class='status' id='st'></div>"
    "</div></body></html>";

static const char PORTAL_SUCCESS_HTML[] =
    "<!DOCTYPE html><html><head>"
    "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Saved!</title>"
    "<style>body{font-family:monospace;background:#09090b;color:#00ff9d;display:flex;"
    "justify-content:center;align-items:center;min-height:100vh;margin:0;text-align:center}"
    "</style></head><body>"
    "<div><h2>Credentials Saved</h2><p>ESP32 will now restart and connect to your network.</p></div>"
    "</body></html>";

/* ── Wi-Fi Event Handler ──────────────────────────────────────── */
static void wifi_event_handler(void *arg, esp_event_base_t base,
                               int32_t id, void *data)
{
    if (base == WIFI_EVENT) {
        switch (id) {
        case WIFI_EVENT_STA_START:
            esp_wifi_connect();
            break;
        case WIFI_EVENT_STA_DISCONNECTED:
            s_connected = false;
            xEventGroupSetBits(s_wifi_events, WIFI_FAIL_BIT);
            break;
        case WIFI_EVENT_AP_STACONNECTED: {
            wifi_event_ap_staconnected_t *ev = (wifi_event_ap_staconnected_t *)data;
            ESP_LOGI(TAG, "Station connected to AP (AID=%d)", ev->aid);
            break;
        }
        default:
            break;
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *ev = (ip_event_got_ip_t *)data;
        snprintf(s_ip_addr, sizeof(s_ip_addr), IPSTR, IP2STR(&ev->ip_info.ip));
        s_connected = true;
        xEventGroupSetBits(s_wifi_events, WIFI_CONNECTED_BIT);
    }
}

/* ── NVS Credential Helpers ───────────────────────────────────── */
static bool nvs_load_credentials(char *ssid, size_t ssid_len,
                                  char *pass, size_t pass_len)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) != ESP_OK) return false;

    esp_err_t e1 = nvs_get_str(h, NVS_KEY_SSID, ssid, &ssid_len);
    esp_err_t e2 = nvs_get_str(h, NVS_KEY_PASS, pass, &pass_len);
    nvs_close(h);

    return (e1 == ESP_OK && e2 == ESP_OK && strlen(ssid) > 0);
}

static void nvs_save_credentials(const char *ssid, const char *pass)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h) != ESP_OK) {
        ESP_LOGE(TAG, "NVS open failed");
        return;
    }
    nvs_set_str(h, NVS_KEY_SSID, ssid);
    nvs_set_str(h, NVS_KEY_PASS, pass);
    nvs_commit(h);
    nvs_close(h);
    ESP_LOGI(TAG, "Credentials saved to NVS");
}

/* ── Captive Portal HTTP Handlers ─────────────────────────────── */
static esp_err_t portal_get_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, PORTAL_HTML, strlen(PORTAL_HTML));
}

/* Simple URL-decode (in-place) */
static void url_decode(char *str)
{
    char *p = str, *q = str;
    while (*p) {
        if (*p == '%' && p[1] && p[2]) {
            char hex[3] = {p[1], p[2], 0};
            *q++ = (char)strtol(hex, NULL, 16);
            p += 3;
        } else if (*p == '+') {
            *q++ = ' ';
            p++;
        } else {
            *q++ = *p++;
        }
    }
    *q = 0;
}

/* Extract value for a key from "key1=val1&key2=val2" form data */
static bool extract_form_value(const char *body, const char *key,
                                char *out, size_t out_len)
{
    char search[64];
    snprintf(search, sizeof(search), "%s=", key);
    const char *start = strstr(body, search);
    if (!start) return false;
    start += strlen(search);
    const char *end = strchr(start, '&');
    size_t len = end ? (size_t)(end - start) : strlen(start);
    if (len >= out_len) len = out_len - 1;
    memcpy(out, start, len);
    out[len] = 0;
    url_decode(out);
    return true;
}

static esp_err_t portal_post_handler(httpd_req_t *req)
{
    char body[256] = {0};
    int recv_len = httpd_req_recv(req, body, sizeof(body) - 1);
    if (recv_len <= 0) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    body[recv_len] = 0;

    char ssid[33] = {0};
    char pass[65] = {0};

    if (!extract_form_value(body, "ssid", ssid, sizeof(ssid))) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing SSID");
        return ESP_FAIL;
    }
    extract_form_value(body, "password", pass, sizeof(pass));

    ESP_LOGI(TAG, "Portal: received SSID='%s'", ssid);
    nvs_save_credentials(ssid, pass);

    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, PORTAL_SUCCESS_HTML, strlen(PORTAL_SUCCESS_HTML));

    /* Signal that credentials were received */
    xEventGroupSetBits(s_wifi_events, PORTAL_DONE_BIT);
    return ESP_OK;
}

/* Redirect all unknown URIs to portal page (captive portal behavior) */
static esp_err_t portal_redirect_handler(httpd_req_t *req)
{
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    return httpd_resp_send(req, NULL, 0);
}

/* ── Public API ───────────────────────────────────────────────── */

void wifi_manager_init(void)
{
    s_wifi_events = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());

    s_sta_netif = esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    ESP_LOGI(TAG, "Wi-Fi subsystem initialized");
}

wifi_connect_result_t wifi_manager_connect(uint32_t timeout_ms)
{
    char ssid[33] = {0};
    char pass[65] = {0};

    if (!nvs_load_credentials(ssid, sizeof(ssid), pass, sizeof(pass))) {
        return WIFI_CONNECT_NO_CREDENTIALS;
    }

    ESP_LOGI(TAG, "Connecting to SSID: %s", ssid);

    /* Configure STA mode */
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));

    wifi_config_t wifi_cfg = {0};
    strncpy((char *)wifi_cfg.sta.ssid, ssid, sizeof(wifi_cfg.sta.ssid) - 1);
    strncpy((char *)wifi_cfg.sta.password, pass, sizeof(wifi_cfg.sta.password) - 1);
    wifi_cfg.sta.threshold.authmode = strlen(pass) > 0 ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    /* Wait for connection or failure */
    xEventGroupClearBits(s_wifi_events, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);
    EventBits_t bits = xEventGroupWaitBits(s_wifi_events,
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
        pdTRUE, pdFALSE,
        pdMS_TO_TICKS(timeout_ms));

    if (bits & WIFI_CONNECTED_BIT) {
        return WIFI_CONNECT_OK;
    }

    esp_wifi_stop();
    return (bits & WIFI_FAIL_BIT) ? WIFI_CONNECT_FAIL : WIFI_CONNECT_TIMEOUT;
}

bool wifi_manager_is_connected(void)
{
    return s_connected;
}

const char* wifi_manager_get_ip(void)
{
    return s_ip_addr;
}

int wifi_manager_get_rssi(void)
{
    wifi_ap_record_t ap_info;
    if (esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK) {
        return ap_info.rssi;
    }
    return 0;
}

void wifi_manager_start_ap_portal(void)
{
    /* Get MAC for unique AP name */
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP);
    char ap_ssid[32];
    snprintf(ap_ssid, sizeof(ap_ssid), "ESP32-Setup-%02X%02X", mac[4], mac[5]);

    ESP_LOGI(TAG, "Starting AP: %s", ap_ssid);

    /* Stop any existing Wi-Fi */
    esp_wifi_stop();

    /* Create AP netif if not already */
    if (!s_ap_netif) {
        s_ap_netif = esp_netif_create_default_wifi_ap();
    }

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));

    wifi_config_t ap_cfg = {
        .ap = {
            .channel = 1,
            .max_connection = 4,
            .authmode = WIFI_AUTH_OPEN,
        },
    };
    strncpy((char *)ap_cfg.ap.ssid, ap_ssid, sizeof(ap_cfg.ap.ssid));
    ap_cfg.ap.ssid_len = strlen(ap_ssid);

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    /* Start HTTP server */
    httpd_config_t http_cfg = HTTPD_DEFAULT_CONFIG();
    http_cfg.uri_match_fn = httpd_uri_match_wildcard;

    if (httpd_start(&s_portal_http, &http_cfg) == ESP_OK) {
        /* GET / — portal page */
        httpd_uri_t uri_root = {
            .uri = "/", .method = HTTP_GET, .handler = portal_get_handler};
        httpd_register_uri_handler(s_portal_http, &uri_root);

        /* POST /save — save credentials */
        httpd_uri_t uri_save = {
            .uri = "/save", .method = HTTP_POST, .handler = portal_post_handler};
        httpd_register_uri_handler(s_portal_http, &uri_save);

        /* Wildcard redirect (captive portal detection) */
        httpd_uri_t uri_any = {
            .uri = "/*", .method = HTTP_GET, .handler = portal_redirect_handler};
        httpd_register_uri_handler(s_portal_http, &uri_any);

        ESP_LOGI(TAG, "Captive portal HTTP server started on 192.168.4.1");
    }

    xEventGroupClearBits(s_wifi_events, PORTAL_DONE_BIT);
}

bool wifi_manager_wait_for_portal_result(uint32_t timeout_ms)
{
    EventBits_t bits = xEventGroupWaitBits(s_wifi_events,
        PORTAL_DONE_BIT, pdTRUE, pdFALSE, pdMS_TO_TICKS(timeout_ms));
    return (bits & PORTAL_DONE_BIT) != 0;
}

void wifi_manager_stop_ap_portal(void)
{
    if (s_portal_http) {
        httpd_stop(s_portal_http);
        s_portal_http = NULL;
    }
    esp_wifi_stop();
    ESP_LOGI(TAG, "AP portal stopped");
}

void wifi_manager_erase_credentials(void)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
    ESP_LOGI(TAG, "Wi-Fi credentials erased");
}
