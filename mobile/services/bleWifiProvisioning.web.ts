export type ConnectedProvisioningDevice = {
  id: string;
  name: string | null;
  writeWifiCredentials: (ssid: string, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

export async function scanAndConnectEsp32Setup(): Promise<ConnectedProvisioningDevice> {
  throw new Error("Bluetooth provisioning is not supported on web.");
}
