export interface E2EEBridgePlugin {
  getCapabilities(): Promise<E2EEBridgeCapabilities>;
}

export interface E2EEBridgeCapabilities {
  available: false;
  platform: "android" | "ios" | "web" | "unknown";
  reason: "not_implemented" | "native_platform_required" | "native_bridge_error";
}
