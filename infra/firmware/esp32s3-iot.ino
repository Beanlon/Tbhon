// TBhon ESP32-S3 IoT — raw-socket HTTP (HTTPClient caused connection refused on Rain WiFi).
// Flow: poll 500ms idle → record (I2S only + light stop-poll) → upload → drain stale stops.

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
#define MAX_RECORD_SECONDS 13
#define RECORD_STOP_POLL_MS 500
#define I2S_READS_PER_LOOP 32
#define UPLOAD_CHUNK_SIZE 8192
#define UPLOAD_CONNECT_TIMEOUT_MS 15000
#define UPLOAD_IO_TIMEOUT_MS 60000
#define UPLOAD_RESPONSE_WAIT_MS 30000
#define POLL_INTERVAL_MS 500
#define POLL_RETRY_ATTEMPTS 2
#define POLL_CONNECT_TIMEOUT_MS 3000
#define POLL_READ_TIMEOUT_MS 3000
#define I2S_READ_TIMEOUT_MS 50
#define CAMERA_MODEL_ESP32S3_EYE
#include "camera_pins.h"

const char* ssid = "Rain";
const char* password = "Mypldtpwis1!";

Preferences preferences;
String bleSSID = "mica";
String blePassword = "09154641874";

bool isRecording = false;
bool isUploading = false;
bool uploadPending = false;
unsigned long recordStartMillis = 0;
unsigned long lastPollMs = 0;
unsigned long lastStopPollMs = 0;
File audioFile;
uint32_t bytesWritten = 0;
String pendingCommand = "";

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define WIFI_CHARACTERISTIC "abcd0001-1234-1234-1234-123456789abc"

class WifiCallback : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String json = pCharacteristic->getValue().c_str();
        int ssidStart = json.indexOf("\"ssid\":\"") + 8;
        int ssidEnd   = json.indexOf("\"", ssidStart);
        bleSSID = json.substring(ssidStart, ssidEnd);
        int passStart = json.indexOf("\"password\":\"") + 12;
        int passEnd   = json.indexOf("\"", passStart);
        blePassword = json.substring(passStart, passEnd);
        preferences.begin("wifi", false);
        preferences.putString("ssid", bleSSID);
        preferences.putString("pass", blePassword);
        preferences.end();
        Serial.println("WiFi credentials saved");
    }
};

const char* host = "159.223.42.179";
const int   port = 4000;
String apiKey = "tbhon-iot-dev-7f3a2c9d4e8b1a0f5c6d7e2b9a3c8d4e";
String userId = "";
String sessionId = "";
int coughAttempt = 0;

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
    if (body.length() == 0) { outCommand = ""; return false; }

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
        Serial.println("Parsed: cmd=" + outCommand + " slot=" + String(coughAttempt));
        return outCommand == "image" || outCommand == "audio"
            || outCommand == "audio upload" || outCommand == "stop audio";
    }
    outCommand = "";
    return false;
}

static bool isStopCommand(const String& cmd) {
    return cmd == "stop audio" || cmd == "audio upload";
}

bool waitForWiFiConnected() {
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        if (millis() - start > 30000) {
            Serial.println("\nStill waiting for WiFi...");
            start = millis();
        }
    }
    Serial.println("\nWiFi OK: " + WiFi.localIP().toString() + " RSSI=" + String(WiFi.RSSI()));
    return true;
}

void connectWiFiWithCredentials(const char* s, const char* p) {
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);
    WiFi.begin(s, p);
    Serial.println("Connecting WiFi (" + String(s) + ")...");
    waitForWiFiConnected();
}

bool ensureWiFi() {
    if (WiFi.status() == WL_CONNECTED) return true;
    Serial.println("WiFi lost — reconnecting...");
    preferences.begin("wifi", true);
    String savedSSID = preferences.getString("ssid", "");
    String savedPASS = preferences.getString("pass", "");
    preferences.end();
    if (savedSSID.length() > 0) {
        connectWiFiWithCredentials(savedSSID.c_str(), savedPASS.c_str());
    } else {
        connectWiFiWithCredentials(ssid, password);
    }
    return WiFi.status() == WL_CONNECTED;
}

bool httpGetOnce(const String& path, String& outBody) {
    outBody = "";
    if (!ensureWiFi()) return false;

    WiFiClient client;
    client.setTimeout(POLL_READ_TIMEOUT_MS);
    if (!client.connect(host, port, POLL_CONNECT_TIMEOUT_MS)) {
        client.stop();
        return false;
    }

    client.println("GET " + path + " HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("X-IoT-Key: " + apiKey);
    client.println("Connection: close");
    client.println();

    unsigned long t0 = millis();
    while (!client.available()) {
        if (millis() - t0 > POLL_READ_TIMEOUT_MS || !client.connected()) {
            client.stop();
            return false;
        }
        delay(2);
    }

    String status = client.readStringUntil('\n');
    if (status.indexOf("200") < 0) {
        client.stop();
        return false;
    }

    long contentLength = 0;
    while (client.connected() || client.available()) {
        String line = client.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) break;
        if (line.startsWith("Content-Length:")) {
            contentLength = line.substring(15).toInt();
        }
    }

    if (contentLength > 0) {
        while ((long) outBody.length() < contentLength && millis() - t0 < POLL_READ_TIMEOUT_MS) {
            if (client.available()) outBody += (char) client.read();
            else if (!client.connected()) break;
            else delay(1);
        }
    }

    outBody.trim();
    client.stop();
    return true;
}

bool httpGet(const String& path, String& outBody) {
    for (int attempt = 0; attempt < POLL_RETRY_ATTEMPTS; attempt++) {
        if (attempt > 0) delay(400 * attempt);
        if (httpGetOnce(path, outBody)) return true;
    }
    return false;
}

static int readHttpResponseCode(WiFiClient& client, unsigned long waitMs) {
    unsigned long waitStart = millis();
    while (millis() - waitStart < waitMs) {
        if (client.available()) {
            String status = client.readStringUntil('\n');
            status.trim();
            int sp = status.indexOf(' ');
            if (sp >= 0) {
                int code = status.substring(sp + 1).toInt();
                unsigned long drainStart = millis();
                while (client.connected() && millis() - drainStart < 3000) {
                    while (client.available()) client.read();
                    delay(2);
                }
                return code;
            }
            return 0;
        }
        if (!client.connected()) break;
        delay(5);
    }
    return 0;
}

static bool writeAll(WiFiClient& client, const uint8_t* data, size_t len) {
    size_t sent = 0;
    unsigned long lastProgress = millis();
    while (sent < len) {
        if (!client.connected()) return false;
        size_t w = client.write(data + sent, len - sent);
        if (w > 0) {
            sent += w;
            lastProgress = millis();
        } else if (millis() - lastProgress > 10000) {
            return false;
        } else {
            delay(1);
        }
        yield();
    }
    return true;
}

void pollDeviceCommandsIfDue();
void processPendingCommand();
void drainStaleStopCommands(int maxItems);
void stopAudioRecordingAndUpload();
bool uploadRecordedFile();

static bool writeFileChunks(WiFiClient& client, File& file) {
    static uint8_t buf[UPLOAD_CHUNK_SIZE];
    while (file.available()) {
        size_t n = file.read(buf, sizeof(buf));
        if (n == 0) break;
        if (!writeAll(client, buf, n)) return false;
        yield();
    }
    return true;
}

void drainStaleStopCommands(int maxItems) {
    for (int i = 0; i < maxItems; i++) {
        String body = "";
        if (!httpGetOnce("/iot/device-command", body)) break;
        if (body.length() == 0) break;
        Serial.println("Drain: " + body);
        String cmd = "";
        if (!parseDeviceCommand(body, cmd)) continue;
        if (isStopCommand(cmd)) {
            Serial.println("Drained stale stop");
            continue;
        }
        if (cmd == "audio" || cmd == "image") {
            pendingCommand = cmd;
            Serial.println("Held pending: " + cmd);
        }
        break;
    }
}

static bool httpPostMultipartCore(const String& path, const String& head, size_t bodyLen,
                                  const String& tail, WiFiClient& client) {
    uint32_t contentLength = head.length() + bodyLen + tail.length();
    client.println("POST " + path + " HTTP/1.1");
    client.println("Host: " + String(host));
    client.println("X-IoT-Key: " + apiKey);
    client.println("Content-Type: multipart/form-data; boundary=----ESP32Boundary");
    client.println("Content-Length: " + String(contentLength));
    client.println("Connection: close");
    client.println();
    client.print(head);
    return true;
}

bool httpPostMultipartFile(const String& path, const String& head, File& file, size_t fileLen, const String& tail) {
    if (!ensureWiFi()) return false;
    for (int attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
            Serial.println("Upload retry " + String(attempt + 1));
            delay(800 * attempt);
            if (!ensureWiFi()) continue;
            file.seek(0);
        }
        WiFiClient client;
        client.setNoDelay(true);
        client.setTimeout(UPLOAD_IO_TIMEOUT_MS);
        if (!client.connect(host, port, UPLOAD_CONNECT_TIMEOUT_MS)) {
            Serial.println("Upload connect failed");
            continue;
        }
        if (!httpPostMultipartCore(path, head, fileLen, tail, client)) { client.stop(); continue; }
        if (!writeFileChunks(client, file)) { client.stop(); continue; }
        client.print(tail);
        client.flush();
        int httpCode = readHttpResponseCode(client, UPLOAD_RESPONSE_WAIT_MS);
        Serial.println("Upload HTTP " + String(httpCode));
        client.stop();
        if (httpCode >= 200 && httpCode < 300) return true;
    }
    return false;
}

bool httpPostMultipart(const String& path, const String& head, const uint8_t* data, size_t dataLen, const String& tail) {
    if (!ensureWiFi()) return false;
    for (int attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
            Serial.println("Upload retry " + String(attempt + 1));
            delay(800 * attempt);
            if (!ensureWiFi()) continue;
        }
        WiFiClient client;
        client.setNoDelay(true);
        client.setTimeout(UPLOAD_IO_TIMEOUT_MS);
        if (!client.connect(host, port, UPLOAD_CONNECT_TIMEOUT_MS)) continue;
        if (!httpPostMultipartCore(path, head, dataLen, tail, client)) { client.stop(); continue; }
        if (dataLen > 0 && !writeAll(client, data, dataLen)) { client.stop(); continue; }
        client.print(tail);
        client.flush();
        int httpCode = readHttpResponseCode(client, UPLOAD_RESPONSE_WAIT_MS);
        Serial.println("Upload HTTP " + String(httpCode));
        client.stop();
        if (httpCode >= 200 && httpCode < 300) return true;
    }
    return false;
}

void uploadImage();
void startAudioRecording();
void executeCommand(const String& command);

String getTriggerCommand() {
    String body = "";
    if (!httpGet("/iot/device-command", body)) {
        return "";
    }
    if (body.length() > 0) Serial.println("CMD: " + body);
    return body;
}

void handleIncomingCommand(const String& raw) {
    String command = "";
    if (!parseDeviceCommand(raw, command)) return;

    if (command == "audio" && (isUploading || uploadPending)) {
        Serial.println("Holding audio start until upload done");
        pendingCommand = "audio";
        return;
    }

    executeCommand(command);
}

void pollDeviceCommandsIfDue() {
    if (isUploading || uploadPending || isRecording) return;
    unsigned long now = millis();
    if (now - lastPollMs < POLL_INTERVAL_MS) return;
    lastPollMs = now;
    handleIncomingCommand(getTriggerCommand());
}

void processPendingCommand() {
    if (pendingCommand.length() == 0 || isUploading || uploadPending || isRecording) return;
    Serial.println("Running pending: " + pendingCommand);
    String cmd = pendingCommand;
    pendingCommand = "";
    executeCommand(cmd);
}

void writeWavHeader(File file, uint32_t dataSize) {
    uint32_t fileSize = dataSize + WAV_HEADER_SIZE - 8;
    uint16_t audioFormat = 1, numChannels = 1, blockAlign = 2, bitsPerSample = 16;
    uint32_t sampleRate = SAMPLE_RATE;
    uint32_t byteRate = SAMPLE_RATE * 2;
    uint32_t subChunk1Size = 16;
    file.seek(0);
    file.write((const uint8_t *)"RIFF", 4);
    file.write((uint8_t *)&fileSize, 4);
    file.write((const uint8_t *)"WAVE", 4);
    file.write((const uint8_t *)"fmt ", 4);
    file.write((uint8_t *)&subChunk1Size, 4);
    file.write((uint8_t *)&audioFormat, 2);
    file.write((uint8_t *)&numChannels, 2);
    file.write((uint8_t *)&sampleRate, 4);
    file.write((uint8_t *)&byteRate, 4);
    file.write((uint8_t *)&blockAlign, 2);
    file.write((uint8_t *)&bitsPerSample, 2);
    file.write((const uint8_t *)"data", 4);
    file.write((uint8_t *)&dataSize, 4);
}

void executeCommand(const String& command) {
    if (command == "image") {
        uploadImage();
    } else if (command == "audio") {
        startAudioRecording();
    } else if (isStopCommand(command)) {
        if (!isRecording) {
            Serial.println("Ignoring stop (not recording)");
            return;
        }
        stopAudioRecordingAndUpload();
    }
}

void uploadImage() {
    if (userId.length() == 0 || sessionId.length() == 0) {
        Serial.println("Missing userId/sessionId");
        return;
    }
    if (isRecording || isUploading || uploadPending) {
        Serial.println("Busy — cannot capture image now");
        return;
    }
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { Serial.println("Camera failed"); return; }

    String boundary = "----ESP32Boundary";
    String head = "";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"userId\"\r\n\r\n" + userId + "\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"sessionId\"\r\n\r\n" + sessionId + "\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"deviceId\"\r\n\r\nESP32-CAM-01\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
    String tail = "\r\n--" + boundary + "--\r\n";

    isUploading = true;
    bool ok = httpPostMultipart("/iot/sputum-images", head, fb->buf, fb->len, tail);
    isUploading = false;
    esp_camera_fb_return(fb);
    Serial.println(ok ? "Image uploaded" : "Image upload failed");
    lastPollMs = 0;
}

void startAudioRecording() {
    if (isUploading || uploadPending) {
        pendingCommand = "audio";
        Serial.println("Holding audio start until upload done");
        return;
    }
    if (isRecording) {
        Serial.println("Already recording");
        return;
    }
    Serial.println("START RECORDING slot " + String(coughAttempt));
    SPIFFS.remove("/record.wav");
    audioFile = SPIFFS.open("/record.wav", FILE_WRITE);
    if (!audioFile) { Serial.println("Failed to create WAV"); return; }
    uint8_t header[WAV_HEADER_SIZE] = {0};
    audioFile.write(header, WAV_HEADER_SIZE);
    bytesWritten = 0;
    recordStartMillis = millis();
    lastStopPollMs = millis();
    isRecording = true;
}

void processAudioRecording() {
    if (!isRecording) return;

    uint8_t i2sData[4096];
    size_t bytesRead = 0;
    esp_err_t result = i2s_read(I2S_NUM_0, (void*)i2sData, sizeof(i2sData), &bytesRead,
                                I2S_READ_TIMEOUT_MS / portTICK_PERIOD_MS);
    if (result != ESP_OK || bytesRead == 0) return;

    int32_t* samples = (int32_t*)i2sData;
    for (int i = 0; i < (int)(bytesRead / 4); i++) {
        int16_t sample16 = (int16_t)(samples[i] >> 16);
        audioFile.write((uint8_t*)&sample16, sizeof(sample16));
        bytesWritten += sizeof(sample16);
    }
}

void pollForStopWhileRecording() {
    if (!isRecording) return;

    if (millis() - recordStartMillis >= (unsigned long)MAX_RECORD_SECONDS * 1000UL) {
        Serial.println("MAX RECORD TIME (safety)");
        stopAudioRecordingAndUpload();
        return;
    }

    unsigned long now = millis();
    if (now - lastStopPollMs < RECORD_STOP_POLL_MS) return;
    lastStopPollMs = now;

    String body = "";
    if (!httpGetOnce("/iot/device-command", body)) return;
    if (body.length() == 0) return;

    Serial.println("CMD: " + body);
    String cmd = "";
    if (!parseDeviceCommand(body, cmd)) return;
    if (isStopCommand(cmd)) {
        stopAudioRecordingAndUpload();
    }
}

void stopAudioRecordingAndUpload() {
    if (!isRecording) return;
    isRecording = false;
    writeWavHeader(audioFile, bytesWritten);
    audioFile.close();
    Serial.println("STOPPED — " + String(bytesWritten) + " bytes");
    uploadPending = true;
}

bool uploadRecordedFile() {
    if (isUploading) return false;
    isUploading = true;

    File uploadFile = SPIFFS.open("/record.wav");
    if (!uploadFile) {
        Serial.println("Cannot open WAV");
        isUploading = false;
        return false;
    }

    size_t fileSize = uploadFile.size();
    String boundary = "----ESP32Boundary";
    String head = "";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"userId\"\r\n\r\n" + userId + "\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"sessionId\"\r\n\r\n" + sessionId + "\r\n";
    if (coughAttempt > 0) {
        head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"coughAttempt\"\r\n\r\n" + String(coughAttempt) + "\r\n";
    }
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"deviceId\"\r\n\r\nESP32-MIC-01\r\n";
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"record.wav\"\r\nContent-Type: audio/wav\r\n\r\n";
    String tail = "\r\n--" + boundary + "--\r\n";

    Serial.println("Uploading slot " + String(coughAttempt) + " (" + String(fileSize) + " bytes)...");
    bool ok = httpPostMultipartFile("/iot/cough-recordings", head, uploadFile, fileSize, tail);
    uploadFile.close();
    Serial.println(ok ? "Upload OK" : "Upload FAILED");
    if (ok) coughAttempt = 0;
    isUploading = false;
    drainStaleStopCommands(5);
    lastPollMs = 0;
    processPendingCommand();
    return ok;
}

void setup() {
    Serial.begin(115200);
    delay(3000);
    Serial.println();
    Serial.println("=================================");
    Serial.println("  TBhon firmware v3 — FLASH THIS");
    Serial.println("=================================");

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 1024,
        .use_apll = false
    };
    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_SCK, .ws_io_num = I2S_WS,
        .data_out_num = I2S_PIN_NO_CHANGE, .data_in_num = I2S_SD
    };
    i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_NUM_0, &pin_config);

    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0; config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM; config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM; config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM; config.pin_pclk = PCLK_GPIO_NUM; config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM; config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM; config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 10000000; config.frame_size = FRAMESIZE_VGA; config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode = CAMERA_GRAB_LATEST; config.fb_location = CAMERA_FB_IN_PSRAM;
    config.jpeg_quality = psramFound() ? 10 : 12; config.fb_count = 2;
    if (!psramFound()) { config.frame_size = FRAMESIZE_HVGA; config.fb_location = CAMERA_FB_IN_DRAM; }
    if (esp_camera_init(&config) != ESP_OK) { Serial.println("Camera init failed"); return; }
    if (!SPIFFS.begin(true)) { Serial.println("SPIFFS failed"); return; }

    preferences.begin("wifi", true);
    String savedSSID = preferences.getString("ssid", "");
    String savedPASS = preferences.getString("pass", "");
    preferences.end();

    if (savedSSID.length() > 0) {
        connectWiFiWithCredentials(savedSSID.c_str(), savedPASS.c_str());
    } else {
        connectWiFiWithCredentials(ssid, password);
    }

    delay(500);
    String health = "";
    if (httpGet("/health", health)) {
        Serial.println("Backend reachable");
    }
    Serial.println("Ready — polling every 500ms");
    drainStaleStopCommands(8);
    lastPollMs = millis();
}

void loop() {
    if (!ensureWiFi()) return;

    if (isRecording) {
        for (int i = 0; i < I2S_READS_PER_LOOP; i++) {
            processAudioRecording();
            if (!isRecording) break;
        }
        pollForStopWhileRecording();
        return;
    }

    if (uploadPending && !isUploading) {
        uploadPending = false;
        if (!uploadRecordedFile()) {
            uploadPending = true;
            delay(1000);
        }
        return;
    }

    pollDeviceCommandsIfDue();
    processPendingCommand();
}
