import { BleManager, type Device } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { PermissionsAndroid, Platform } from "react-native";

const ESP32_SETUP_NAME = "ESP32-IOT-SETUP";

// Matches the IoT developer prompt.
const WIFI_SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const WIFI_CHAR_UUID = "abcd0001-1234-1234-1234-123456789abc";
const PROVISIONING_SERVICE_UUIDS = [WIFI_SERVICE_UUID];

export type ConnectedProvisioningDevice = {
  id: string;
  name: string | null;
  writeWifiCredentials: (ssid: string, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

async function requestAndroidBlePermissions(): Promise<void> {
  if (Platform.OS !== "android") return;

  const sdkInt = typeof Platform.Version === "number" ? Platform.Version : 0;

  type AndroidPermission = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];
  const toRequest: AndroidPermission[] = [];

  // Android 12+
  if (sdkInt >= 31) {
    toRequest.push(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    );
  } else {
    // Pre-Android 12 scan permission is tied to location in practice.
    toRequest.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  const results = await PermissionsAndroid.requestMultiple(toRequest);
  const denied = Object.entries(results)
    .filter(([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED)
    .map(([k]) => k);

  if (denied.length > 0) {
    throw new Error("Bluetooth permission is required to scan for the device.");
  }
}

function ensureBluetoothReady(
  manager: BleManager,
  args?: { timeoutMs?: number; onStatus?: (message: string) => void },
): Promise<void> {
  const timeoutMs = args?.timeoutMs ?? 12_000;
  const onStatus = args?.onStatus;

  return new Promise((resolve, reject) => {
    // NOTE: With the second argument `true`, some implementations invoke the callback
    // synchronously with the current state. Avoid referencing the subscription inside
    // the callback until after it has been assigned.
    let subscription: { remove: () => void } | null = null;
    const removeSoon = () => queueMicrotask(() => subscription?.remove());

    let lastState:
      | "Unknown"
      | "Resetting"
      | "Unsupported"
      | "Unauthorized"
      | "PoweredOff"
      | "PoweredOn"
      | null = null;

    const timeout = setTimeout(() => {
      removeSoon();

      if (lastState === "PoweredOff") {
        reject(new Error("Bluetooth is off. Please turn it on and try again."));
        return;
      }
      if (lastState === "Unauthorized") {
        reject(
          new Error(
            Platform.OS === "ios"
              ? "Bluetooth permission was denied. Enable Bluetooth access for this app in iOS Settings and try again."
              : "Bluetooth permission was denied. Please allow Bluetooth permissions and try again.",
          ),
        );
        return;
      }

      reject(new Error("Bluetooth is not ready. Please enable Bluetooth and try again."));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      removeSoon();
    };

    subscription = manager.onStateChange(
      (state) => {
        lastState = state;

        if (state === "PoweredOn") {
          cleanup();
          resolve();
          return;
        }

        if (state === "Unsupported") {
          cleanup();
          reject(new Error("Bluetooth is not supported on this device."));
          return;
        }

        if (state === "Unauthorized") {
          onStatus?.(
            Platform.OS === "ios"
              ? "Bluetooth permission is not allowed. Enable it in Settings."
              : "Bluetooth permission is not allowed. Please grant permission.",
          );
          cleanup();
          reject(
            new Error(
              Platform.OS === "ios"
                ? "Bluetooth permission was denied. Enable Bluetooth access for this app in iOS Settings and try again."
                : "Bluetooth permission was denied. Please allow Bluetooth permissions and try again.",
            ),
          );
          return;
        }

        if (state === "PoweredOff") {
          onStatus?.("Bluetooth is off — please turn it on…");
          return;
        }

        if (state === "Resetting") {
          onStatus?.("Resetting Bluetooth…");
          return;
        }
      },
      true,
    );

    // If state never becomes PoweredOn, user can exit or retry.
  });
}

function getDeviceName(device: Device): string | null {
  return device.name ?? device.localName ?? null;
}

function isEsp32SetupDevice(device: Device): boolean {
  return getDeviceName(device) === ESP32_SETUP_NAME;
}

function hasProvisioningService(device: Device): boolean {
  return device.serviceUUIDs?.some((uuid) => uuid.toLowerCase() === WIFI_SERVICE_UUID) ?? false;
}

async function connectAndCreateProvisioningDevice(
  manager: BleManager,
  device: Device,
): Promise<ConnectedProvisioningDevice> {
  const isConnected = await device.isConnected();
  const connected = isConnected ? device : await device.connect();
  await connected.discoverAllServicesAndCharacteristics();

  const writeWifiCredentials = async (ssid: string, password: string) => {
    const payload = { ssid, password };
    const jsonString = JSON.stringify(payload);
    const base64Data = Buffer.from(jsonString).toString("base64");

    await connected.writeCharacteristicWithResponseForService(
      WIFI_SERVICE_UUID,
      WIFI_CHAR_UUID,
      base64Data,
    );
  };

  const disconnect = async () => {
    try {
      await connected.cancelConnection();
    } catch {
      // ignore
    }
    manager.destroy();
  };

  return {
    id: connected.id,
    name: getDeviceName(connected),
    writeWifiCredentials,
    disconnect,
  };
}

async function getAlreadyConnectedSetupDevice(manager: BleManager): Promise<Device | null> {
  const connectedDevices = await manager.connectedDevices(PROVISIONING_SERVICE_UUIDS);
  if (connectedDevices.length === 0) return null;

  return connectedDevices.find(isEsp32SetupDevice) ?? connectedDevices[0] ?? null;
}

function scanForNamedDevice(manager: BleManager, name: string, timeoutMs: number): Promise<Device> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        manager.stopDeviceScan();
      } catch {
        // ignore
      }
      reject(
        new Error(
          `Could not find ${name}. Make sure the device is on and nearby, then connect from the app or your phone Bluetooth settings.`,
        ),
      );
    }, timeoutMs);

    manager.startDeviceScan(null, null, (error, device) => {
      if (finished) return;
      if (error) {
        finished = true;
        clearTimeout(timeout);
        try {
          manager.stopDeviceScan();
        } catch {
          // ignore
        }
        reject(new Error(error.message));
        return;
      }

      if (!device) return;
      if (!isEsp32SetupDevice(device) && !hasProvisioningService(device)) return;

      finished = true;
      clearTimeout(timeout);
      try {
        manager.stopDeviceScan();
      } catch {
        // ignore
      }
      resolve(device);
    });
  });
}

export async function scanAndConnectEsp32Setup(args?: {
  timeoutMs?: number;
  onStatus?: (message: string) => void;
}): Promise<ConnectedProvisioningDevice> {
  const timeoutMs = args?.timeoutMs ?? 20_000;
  const onStatus = args?.onStatus;

  await requestAndroidBlePermissions();

  const manager = new BleManager();

  try {
    onStatus?.("Waiting for Bluetooth to turn on…");
    await ensureBluetoothReady(manager, { timeoutMs: 12_000, onStatus });

    onStatus?.("Checking phone Bluetooth connections…");
    const alreadyConnected = await getAlreadyConnectedSetupDevice(manager);
    if (alreadyConnected) {
      onStatus?.(`Using connected Bluetooth device ${getDeviceName(alreadyConnected) ?? "ESP32"}…`);
      return await connectAndCreateProvisioningDevice(manager, alreadyConnected);
    }

    onStatus?.("Scanning for ESP32-IOT-SETUP…");
    const found = await scanForNamedDevice(manager, ESP32_SETUP_NAME, timeoutMs);

    onStatus?.("Connecting…");
    return await connectAndCreateProvisioningDevice(manager, found);
  } catch (e) {
    manager.destroy();
    throw e;
  }
}
