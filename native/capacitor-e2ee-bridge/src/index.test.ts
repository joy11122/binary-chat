import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn<() => boolean>(),
  getPlatform: vi.fn<() => string>(),
  getCapabilities: vi.fn<() => Promise<{ available: boolean; platform: string; reason: string }>>(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
  registerPlugin: () => ({
    getCapabilities: mocks.getCapabilities,
  }),
}));

import { getE2EEBridgeCapabilities } from "./index";

describe("E2EE bridge fail-closed capability contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects browser contexts without invoking a native plugin", async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.getPlatform.mockReturnValue("web");

    await expect(getE2EEBridgeCapabilities()).resolves.toEqual({
      available: false,
      platform: "web",
      reason: "native_platform_required",
    });
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });

  it("keeps Android disabled when the native scaffold reports not implemented", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("android");
    mocks.getCapabilities.mockResolvedValue({
      available: false,
      platform: "android",
      reason: "not_implemented",
    });

    await expect(getE2EEBridgeCapabilities()).resolves.toEqual({
      available: false,
      platform: "android",
      reason: "not_implemented",
    });
  });

  it("keeps iOS disabled when the native scaffold reports not implemented", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("ios");
    mocks.getCapabilities.mockResolvedValue({
      available: false,
      platform: "ios",
      reason: "not_implemented",
    });

    await expect(getE2EEBridgeCapabilities()).resolves.toEqual({
      available: false,
      platform: "ios",
      reason: "not_implemented",
    });
  });

  it("rejects unexpected capability responses instead of enabling E2EE", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("android");
    mocks.getCapabilities.mockResolvedValue({
      available: true,
      platform: "android",
      reason: "ready",
    });

    await expect(getE2EEBridgeCapabilities()).resolves.toEqual({
      available: false,
      platform: "android",
      reason: "native_bridge_error",
    });
  });

  it("fails closed when the native bridge throws", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("ios");
    mocks.getCapabilities.mockRejectedValue(new Error("native bridge unavailable"));

    await expect(getE2EEBridgeCapabilities()).resolves.toEqual({
      available: false,
      platform: "ios",
      reason: "native_bridge_error",
    });
  });

  it("rejects unsupported native platforms", async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getPlatform.mockReturnValue("electron");

    await expect(getE2EEBridgeCapabilities()).resolves.toEqual({
      available: false,
      platform: "unknown",
      reason: "native_platform_required",
    });
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });
});
