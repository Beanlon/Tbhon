// TBhon ESP32-S3 IoT — polls backend, reports presence, records/uploads cough audio.
// Pair with Tbhon-Backend: GET /iot/device-command, POST /iot/presence, POST /iot/cough-recordings

#include "esp_camera.h"
#include <WiFi.h>
#include <SPIFFS.h>
#include <driver/i2s.h>

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <Preferences.h>

#define I2S_WS   41
#define I2S_SD   21
#define I2S_SCK  47

#define SAMPLE_RATE 16000
#define WAV_HEADER_SIZE 44
/** INMP441 32-bit I2S slot — use 14-bit shift (not 16) or audio sounds wrong/fast. */
#define I2S_MIC_SHIFT 14

#define CAMERA_MODEL_ESP32S3_EYE
#include "camera_pins.h"

#define MAX_RECORD_SECONDS 10
#define POLL_INTERVAL_MS 500
#define PRESENCE_INTERVAL_MS 500
#define HTTP_CONNECT_TIMEOUT_MS 12000
#define HTTP_READ_TIMEOUT_MS 8000
#define HTTP_UPLOAD_DRAIN_MS 2500
#define HTTP_CONNECT_RETRIES 3
#define POLL_BACKOFF_MS 3000
#define UPLOAD_CHUNK_SIZE 4096

// ================= WIFI =================

const char* ssid = "Rain";
const char* password = "Mypldtpwis1!";

// ================= BLE WIFI PROVISIONING =================

Preferences preferences;

String bleSSID = "";
String blePassword = "";
bool credentialsReceived = false;

bool isUploading = false;
/** 10s mono 16-bit @ 16 kHz */
static const uint32_t PCM_CAPTURE_BYTES = SAMPLE_RATE * 2 * MAX_RECORD_SECONDS;
static uint8_t* pcmCaptureBuf = nullptr;
unsigned long lastIdlePollMs = 0;
unsigned long lastPresenceMs = 0;
unsigned long pollBackoffUntilMs = 0;
int consecutiveConnectFails = 0;

uint32_t bytesWritten = 0;

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define WIFI_CHARACTERISTIC "abcd0001-1234-1234-1234-123456789abc"

class WifiCallback : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String json = pCharacteristic->getValue().c_str();
        Serial.println("Received JSON:");
        Serial.println(json);

        int ssidStart = json.indexOf("\"ssid\":\"") + 8;
        int ssidEnd   = json.indexOf("\"", ssidStart);
        bleSSID = json.substring(ssidStart, ssidEnd);

        int passStart = json.indexOf("\"password\":\"") + 12;
        int passEnd   = json.indexOf("\"", passStart);
        blePassword = json.substring(passStart, passEnd);

        credentialsReceived = true;

        preferences.begin("wifi", false);
        preferences.putString("ssid", bleSSID);
        preferences.putString("pass", blePassword);
        preferences.end();

        Serial.println("WiFi credentials saved");
    }
};

// ================= SERVER =================

const char* host = "159.223.42.179";
const int   port = 4000;

String apiKey = "tbhon-iot-dev-7f3a2c9d4e8b1a0f5c6d7e2b9a3c8d4e";

String userId = "";
String sessionId = "";
int coughAttempt = 0;

// ================= JSON HELPERS =================

String extractJsonString(const String& json, const char* key) {
    String search = String("\"") + key + "\":\"";
    int start = json.indexOf(search);
    if (start < 0) return "";
    start += search.length();
    int end = json.indexOf("\"", start);
    if (end < 0) return "";
    return json.substring(start, end);
}

int extractJsonInt(const String& json, const char* key) {
    String search = String("\"") + key + "\":";
    int start = json.indexOf(search);
    if (start < 0) return 0;
    start += search.length();
    int end = json.indexOf(",", start);
    if (end < 0) end = json.indexOf("}", start);
    if (end < 0) return 0;
    String value = json.substring(start, end);
    value.trim();
    return value.toInt();
}

bool parseDeviceCommand(const String& raw, String& outCommand) {
    String body = raw;
    body.trim();

    if (body.length() == 0) {
        outCommand = "";
        return false;
    }

    if (body == "image" || body == "audio" || body == "audio upload" || body == "stop audio") {
        outCommand = body;
        return true;
    }

    if (body.indexOf("\"command\"") >= 0) {
        outCommand = extractJsonString(body, "command");
        outCommand.trim();

        String uid = extractJsonString(body, "userId");
        String sid = extractJsonString(body, "sessionId");
        int attempt = extractJsonInt(body, "coughAttempt");

        if (uid.length() > 0) userId = uid;
        if (sid.length() > 0) sessionId = sid;
        if (attempt > 0) coughAttempt = attempt;

        Serial.println("Parsed command: " + outCommand);
        Serial.println("Parsed userId: " + userId);
        Serial.println("Parsed sessionId: " + sessionId);
        Serial.println("Parsed coughAttempt: " + String(coughAttempt));

        return outCommand == "image"
            || outCommand == "audio"
            || outCommand == "audio upload"
            || outCommand == "stop audio";
    }

    outCommand = "";
    return false;
}

static bool isStopCommand(const String& cmd) {
    return cmd == "stop audio" || cmd == "audio upload";
}

void stopAudioRecordingAndUpload();
void uploadRecordedFile();

bool ensureWifiConnected() {
    if (WiFi.status() == WL_CONNECTED) {
        return true;
    }
    Serial.println("WiFi disconnected — reconnecting...");
    preferences.begin("wifi", true);
    String savedSSID = preferences.getString("ssid", "");
    String savedPASS = preferences.getString("pass", "");
    preferences.end();
    if (savedSSID.length() > 0) {
        WiFi.begin(savedSSID.c_str(), savedPASS.c_str());
    } else {
        WiFi.begin(ssid, password);
    }
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
        delay(500);
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("WiFi back, IP=");
        Serial.println(WiFi.localIP());
        return true;
    }
    Serial.println("WiFi reconnect failed");
    return false;
}

bool connectHttp(WiFiClient& client, const char* label) {
    if (!ensureWifiConnected()) {
        return false;
    }
    for (int attempt = 1; attempt <= HTTP_CONNECT_RETRIES; attempt++) {
        if (client.connect(host, port, HTTP_CONNECT_TIMEOUT_MS)) {
            consecutiveConnectFails = 0;
            pollBackoffUntilMs = 0;
            return true;
        }
        Serial.print(label);
        Serial.print(" connect failed (try ");
        Serial.print(attempt);
        Serial.print("/");
        Serial.print(HTTP_CONNECT_RETRIES);
        Serial.print(") RSSI=");
        Serial.println(WiFi.RSSI());
        client.stop();
        delay(200);
    }
    consecutiveConnectFails++;
    pollBackoffUntilMs = millis() + POLL_BACKOFF_MS;
    Serial.print(label);
    Serial.print(" — backing off ");
    Serial.print(POLL_BACKOFF_MS / 1000);
    Serial.println("s");
    return false;
}

void clearSavedWiFi() {
    preferences.begin("wifi", false);
    preferences.clear();
    preferences.end();
    Serial.println("Saved WiFi cleared");
}

// ================= HTTP HELPERS =================

String readHttpResponseBody(WiFiClient& client) {
    int contentLength = -1;
    bool chunked = false;

    unsigned long t0 = millis();
    while (client.connected() || client.available()) {
        if (millis() - t0 > HTTP_READ_TIMEOUT_MS) break;

        String line = client.readStringUntil('\n');
        line.trim();

        if (line.length() == 0) {
            break;
        }

        if (line.startsWith("Content-Length:")) {
            String cl = line.substring(15);
            cl.trim();
            contentLength = cl.toInt();
        } else if (line.indexOf("chunked") >= 0) {
            chunked = true;
        }
    }

    String body;
    t0 = millis();

    if (contentLength > 0) {
        body.reserve(contentLength + 1);
        uint8_t buf[256];
        int remaining = contentLength;
        while (remaining > 0 && millis() - t0 < HTTP_READ_TIMEOUT_MS) {
            if (!client.available()) {
                if (!client.connected()) break;
                delay(1);
                continue;
            }
            int n = client.read(buf, remaining > (int)sizeof(buf) ? (int)sizeof(buf) : remaining);
            if (n <= 0) {
                delay(1);
                continue;
            }
            for (int i = 0; i < n; i++) body += (char)buf[i];
            remaining -= n;
        }
        return body;
    }

    if (chunked) {
        while (client.connected() || client.available()) {
            if (millis() - t0 > HTTP_READ_TIMEOUT_MS) break;
            String chunkSizeLine = client.readStringUntil('\n');
            int chunkSize = (int)strtol(chunkSizeLine.c_str(), NULL, 16);
            if (chunkSize <= 0) break;
            while (chunkSize > 0 && millis() - t0 < HTTP_READ_TIMEOUT_MS) {
                if (!client.available()) {
                    delay(1);
                    continue;
                }
                body += (char)client.read();
                chunkSize--;
            }
            client.readStringUntil('\n');
        }
        return body;
    }

    while ((client.connected() || client.available()) && millis() - t0 < HTTP_READ_TIMEOUT_MS) {
        if (!client.available()) {
            delay(1);
            continue;
        }
        body += (char)client.read();
    }
    return body;
}

/** Drop POST response without building a huge String (upload path only). */
static void discardHttpResponse(WiFiClient& client) {
    unsigned long t0 = millis();
    while ((client.connected() || client.available()) && millis() - t0 < HTTP_UPLOAD_DRAIN_MS) {
        while (client.available()) {
            client.read();
            t0 = millis();
        }
        delay(1);
    }
}

/** Heartbeat so the mobile app knows idle / recording / uploading (POST /iot/presence). */
void reportPresence(const char* state) {
    WiFiClient client;
    if (!connectHttp(client, "Presence")) {
        return;
    }

    String body = String("{\"state\":\"") + state + "\"}";

    client.println("POST /iot/presence HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("X-IoT-Key: " + apiKey);
    client.println("Content-Type: application/json");
    client.println("Content-Length: " + String(body.length()));
    client.println("Connection: close");
    client.println();
    client.print(body);

    unsigned long t0 = millis();
    while (client.connected() && millis() - t0 < 2000) {
        while (client.available()) client.read();
    }
    client.stop();
    lastPresenceMs = millis();
}

// ================= WAV =================

static void fillWavHeader(uint8_t header[WAV_HEADER_SIZE], uint32_t dataSize) {
    uint32_t fileSize = dataSize + WAV_HEADER_SIZE - 8;
    uint16_t audioFormat = 1;
    uint16_t numChannels = 1;
    uint32_t sampleRate = SAMPLE_RATE;
    uint32_t byteRate = SAMPLE_RATE * numChannels * 16 / 8;
    uint16_t blockAlign = numChannels * 16 / 8;
    uint16_t bitsPerSample = 16;
    uint32_t subChunk1Size = 16;

    memset(header, 0, WAV_HEADER_SIZE);
    memcpy(header + 0, "RIFF", 4);
    memcpy(header + 4, &fileSize, 4);
    memcpy(header + 8, "WAVE", 4);
    memcpy(header + 12, "fmt ", 4);
    memcpy(header + 16, &subChunk1Size, 4);
    memcpy(header + 20, &audioFormat, 2);
    memcpy(header + 22, &numChannels, 2);
    memcpy(header + 24, &sampleRate, 4);
    memcpy(header + 28, &byteRate, 4);
    memcpy(header + 32, &blockAlign, 2);
    memcpy(header + 34, &bitsPerSample, 2);
    memcpy(header + 36, "data", 4);
    memcpy(header + 40, &dataSize, 4);
}

void writeWavHeader(File file, uint32_t dataSize) {
    uint8_t header[WAV_HEADER_SIZE];
    fillWavHeader(header, dataSize);
    file.seek(0);
    file.write(header, WAV_HEADER_SIZE);
}

// ================= DEVICE COMMAND POLL =================

String getTriggerCommand() {
    if (isUploading) return "";

    WiFiClient client;
    String url = "/iot/device-command?status=idle";

    if (!connectHttp(client, "Command poll")) {
        return "";
    }

    client.println("GET " + url + " HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("X-IoT-Key: " + apiKey);
    client.println("Connection: close");
    client.println();

    String response = readHttpResponseBody(client);
    client.stop();

    if (response.length() == 0) {
        Serial.println("Command body: (empty — no command queued)");
    } else {
        Serial.print("Command body (");
        Serial.print(response.length());
        Serial.println(" bytes):");
        Serial.println(response);
    }
    return response;
}

// ================= IMAGE UPLOAD =================

void uploadImage() {
    if (userId.length() == 0 || sessionId.length() == 0) {
        Serial.println("Missing userId or sessionId — wait for JSON command from app");
        return;
    }

    camera_fb_t * fb = NULL;
    for (int i = 0; i < 3; i++) {
        fb = esp_camera_fb_get();
        if (fb) {
            esp_camera_fb_return(fb);
            fb = NULL;
        }
    }

    fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("Camera capture failed");
        return;
    }

    WiFiClient client;
    String url = "/iot/sputum-images";

    if (!connectHttp(client, "Image upload")) {
        Serial.println("Image upload connect failed");
        esp_camera_fb_return(fb);
        return;
    }

    String boundary = "----ESP32Boundary";
    String head = "";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"userId\"\r\n\r\n" + userId + "\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"sessionId\"\r\n\r\n" + sessionId + "\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"deviceId\"\r\n\r\nESP32-CAM-01\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image.jpg\"\r\n";
    head += "Content-Type: image/jpeg\r\n\r\n";
    String tail = "\r\n--" + boundary + "--\r\n";
    uint32_t contentLength = head.length() + fb->len + tail.length();

    client.println("POST " + url + " HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("X-IoT-Key: " + apiKey);
    client.println("Content-Type: multipart/form-data; boundary=" + boundary);
    client.println("Content-Length: " + String(contentLength));
    client.println("Connection: close");
    client.println();
    client.print(head);
    client.write(fb->buf, fb->len);
    client.print(tail);

    readHttpResponseBody(client);
    client.stop();
    esp_camera_fb_return(fb);
    reportPresence("idle");
}

// ================= AUDIO =================

static void flushI2sStartupNoise() {
    uint8_t trash[512];
    size_t br = 0;
    for (int i = 0; i < 16; i++) {
        i2s_read(I2S_NUM_0, trash, sizeof(trash), &br, 0);
    }
}

static bool allocPcmCaptureBuf() {
    if (pcmCaptureBuf) {
        return true;
    }
    pcmCaptureBuf = (uint8_t*)heap_caps_malloc(
        PCM_CAPTURE_BYTES,
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
    );
    if (!pcmCaptureBuf) {
        pcmCaptureBuf = (uint8_t*)heap_caps_malloc(PCM_CAPTURE_BYTES, MALLOC_CAP_8BIT);
    }
    if (!pcmCaptureBuf) {
        Serial.println("PCM RAM alloc failed");
        return false;
    }
    Serial.print("PCM buffer ");
    Serial.print(PCM_CAPTURE_BYTES);
    Serial.println(" bytes OK");
    return true;
}

/**
 * Fill exactly 10s of PCM (320000 bytes). No SPIFFS and no WiFi here —
 * SPIFFS writes in the old loop were dropping ~40% of samples (~6s in 10s wall).
 */
static bool captureTenSecondsToRam() {
    if (!allocPcmCaptureBuf()) {
        return false;
    }

    flushI2sStartupNoise();
    bytesWritten = 0;

    const uint32_t targetBytes = PCM_CAPTURE_BYTES;
    const unsigned long deadlineMs = millis() + (unsigned long)(MAX_RECORD_SECONDS + 3) * 1000UL;
    unsigned long lastLog = millis();

    Serial.println("Capturing 320000 bytes to RAM (10.00s @ 16kHz)...");

    while (bytesWritten < targetBytes && millis() < deadlineMs) {
        for (int burst = 0; burst < 6; burst++) {
            uint8_t i2sChunk[1024];
            size_t br = 0;
            esp_err_t err = i2s_read(
                I2S_NUM_0,
                i2sChunk,
                sizeof(i2sChunk),
                &br,
                0
            );
            if (err != ESP_OK || br < 4) {
                continue;
            }

            int32_t* samples = (int32_t*)i2sChunk;
            int n = (int)(br / 4);
            for (int i = 0; i < n && bytesWritten + 2 <= targetBytes; i++) {
                int16_t sample16 = (int16_t)(samples[i] >> I2S_MIC_SHIFT);
                pcmCaptureBuf[bytesWritten++] = (uint8_t)(sample16 & 0xFF);
                pcmCaptureBuf[bytesWritten++] = (uint8_t)((sample16 >> 8) & 0xFF);
            }
        }

        if (millis() - lastLog >= 1000) {
            float sec = (float)bytesWritten / (float)(SAMPLE_RATE * 2);
            Serial.print("  ");
            Serial.print(sec, 1);
            Serial.print("s");
            lastLog = millis();
        }
    }

    Serial.println();
    float sec = (float)bytesWritten / (float)(SAMPLE_RATE * 2);
    Serial.print("Capture done: ");
    Serial.print(bytesWritten);
    Serial.print(" bytes = ");
    Serial.print(sec, 2);
    Serial.println(" s");

    return bytesWritten >= (uint32_t)(SAMPLE_RATE * 2 * (MAX_RECORD_SECONDS - 1));
}

void uploadRecordedFromRam();

void startAudioRecording() {
    if (isUploading) {
        return;
    }

    Serial.println("=== AUDIO CAPTURE START ===");
    reportPresence("recording");

    if (!captureTenSecondsToRam()) {
        Serial.println("Capture failed — not enough samples");
        reportPresence("idle");
        return;
    }

    isUploading = true;
    reportPresence("uploading");
    uploadRecordedFromRam();
    isUploading = false;
    reportPresence("idle");

    Serial.println("=== AUDIO CAPTURE DONE ===");
}

void stopAudioRecordingAndUpload() {
    if (isUploading) {
        Serial.println("Already uploading");
    }
}

void uploadRecordedFromRam() {
    if (!pcmCaptureBuf || bytesWritten < (uint32_t)(SAMPLE_RATE * 2)) {
        Serial.println("No RAM capture to upload");
        return;
    }

    uint8_t wavHeader[WAV_HEADER_SIZE];
    fillWavHeader(wavHeader, bytesWritten);
    const uint32_t wavBytes = WAV_HEADER_SIZE + bytesWritten;

    WiFiClient client;
    const char* url = "/iot/cough-recordings";

    if (!connectHttp(client, "Audio upload")) {
        Serial.println("Audio connection failed");
        return;
    }
    client.setNoDelay(true);

    const String boundary = "----ESP32Boundary";
    String head = "";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"userId\"\r\n\r\n" + userId + "\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"sessionId\"\r\n\r\n" + sessionId + "\r\n";

    if (coughAttempt > 0) {
        head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"coughAttempt\"\r\n\r\n";
        head += String(coughAttempt) + "\r\n";
    }

    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"deviceId\"\r\n\r\nESP32-MIC-01\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"record.wav\"\r\n";
    head += "Content-Type: audio/wav\r\n\r\n";
    const String tail = "\r\n--" + boundary + "--\r\n";
    const uint32_t contentLength = head.length() + wavBytes + tail.length();

    client.println("POST " + String(url) + " HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("X-IoT-Key: " + apiKey);
    client.println("Content-Type: multipart/form-data; boundary=" + boundary);
    client.println("Content-Length: " + String(contentLength));
    client.println("Connection: close");
    client.println();

    unsigned long tUp = millis();
    client.print(head);
    client.write(wavHeader, WAV_HEADER_SIZE);

    uint32_t offset = 0;
    while (offset < bytesWritten) {
        uint32_t chunk = bytesWritten - offset;
        if (chunk > UPLOAD_CHUNK_SIZE) {
            chunk = UPLOAD_CHUNK_SIZE;
        }
        size_t sent = client.write(pcmCaptureBuf + offset, chunk);
        if (sent == 0) {
            Serial.println("Upload write stalled");
            break;
        }
        offset += (uint32_t)sent;
    }
    client.print(tail);

    Serial.print("Upload payload sent in ");
    Serial.print(millis() - tUp);
    Serial.println(" ms");

    discardHttpResponse(client);
    client.stop();

    Serial.println("Audio uploaded (RAM → WiFi, no SPIFFS)");
    coughAttempt = 0;
}


// ================= BLE =================

void startBLEProvisioning() {
    BLEDevice::init("ESP32-IOT-SETUP");
    BLEServer *pServer = BLEDevice::createServer();
    BLEService *pService = pServer->createService(SERVICE_UUID);

    BLECharacteristic *wifiCharacteristic = pService->createCharacteristic(
        WIFI_CHARACTERISTIC,
        BLECharacteristic::PROPERTY_WRITE
    );
    wifiCharacteristic->setCallbacks(new WifiCallback());
    pService->start();

    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->start();

    Serial.println("BLE provisioning started");
}

// ================= SETUP =================

void setup() {
    Serial.begin(115200);
    delay(3000);
    Serial.println("BOOTING TBhon IoT v8 (RAM capture + RAM upload)...");

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 16,
        .dma_buf_len = 512,
        .use_apll = false
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_SCK,
        .ws_io_num = I2S_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_SD
    };

    i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_NUM_0, &pin_config);
    allocPcmCaptureBuf();

    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 10000000;
    config.frame_size = FRAMESIZE_VGA;
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.jpeg_quality = 12;
    config.fb_count = 2;

    if (psramFound()) {
        Serial.println("PSRAM FOUND");
        config.jpeg_quality = 10;
    } else {
        Serial.println("NO PSRAM FOUND");
        config.frame_size = FRAMESIZE_HVGA;
        config.fb_location = CAMERA_FB_IN_DRAM;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("Camera init failed: 0x%x\n", err);
        return;
    }

    if (!SPIFFS.begin(true)) {
        Serial.println("SPIFFS failed");
        return;
    }

    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);

    preferences.begin("wifi", true);
    String savedSSID = preferences.getString("ssid", "");
    String savedPASS = preferences.getString("pass", "");
    preferences.end();

    if (savedSSID.length() > 0) {
        Serial.println("Using saved BLE WiFi credentials");
        WiFi.begin(savedSSID.c_str(), savedPASS.c_str());
    } else {
        Serial.println("Using hardcoded WiFi");
        WiFi.begin(ssid, password);
    }

    Serial.println("Connecting WiFi...");
    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        if (millis() - startAttempt > 15000) {
            Serial.println("WiFi failed — starting BLE");
            clearSavedWiFi();
            startBLEProvisioning();
            while (!credentialsReceived) delay(500);
            WiFi.begin(bleSSID.c_str(), blePassword.c_str());
            startAttempt = millis();
        }
    }

    Serial.println("");
    Serial.print("WiFi connected IP=");
    Serial.println(WiFi.localIP());
    Serial.print("API target http://");
    Serial.print(host);
    Serial.print(":");
    Serial.println(port);
    reportPresence("idle");
}

// ================= LOOP =================

void loop() {
    if (isUploading) {
        if (millis() - lastPresenceMs >= PRESENCE_INTERVAL_MS) {
            reportPresence("uploading");
        }
        return;
    }

    unsigned long now = millis();
    if (now < pollBackoffUntilMs) {
        return;
    }
    if (now - lastIdlePollMs < POLL_INTERVAL_MS) {
        return;
    }
    lastIdlePollMs = now;

    String raw = getTriggerCommand();
    String command = "";

    if (parseDeviceCommand(raw, command)) {
        if (command == "image") {
            uploadImage();
        } else if (command == "audio") {
            startAudioRecording();
        } else if (isStopCommand(command)) {
            Serial.println("Stop command ignored — capture is fixed 10s then auto-upload");
        }
    }
}
