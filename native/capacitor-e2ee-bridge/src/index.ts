import { Capacitor, registerPlugin } from "@capacitor/core";
import type { E2EEBridgeCapabilities, E2EEBridgePlugin } from "./definitions";

const NativeE2EEBridge = registerPlugin<E2EEBridgePlugin>("BinaryChatE2EEBridge");

export type { E2EEBridgeCapabilities, E2EEBridgePlugin };

export async function getE2EEBridgeCapabilities(): Promise<E2EEBridgeCapabilities> {
  const platform = Capacitor.getPlatform();
  if (!Capacitor.isNativePlatform() || (platform !== "android" && platform !== "ios")) {
    return { available: false, platform: platform === "web" ? "web" : "unknown", reason: "native_platform_required" };
  }

  try {
    const result = await NativeE2EEBridge.getCapabilities();
    // The bridge is intentionally disabled until protocol, storage, and lifecycle audits pass.
    if (result.available !== false || result.reason !== "not_implemented") {
      return { available: false, platform, reason: "native_bridge_error" };
    }
    return { available: false, platform, reason: "not_implemented" };
  } catch {
    return { available: false, platform, reason: "native_bridge_error" };
  }
}
