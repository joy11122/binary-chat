import type { CapacitorConfig } from "@capacitor/cli";

const remoteUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.joyanta.binarychat",
  appName: "Binary Chat",
  webDir: "capacitor-web",
  server: {
    ...(remoteUrl ? { url: remoteUrl } : {}),
    androidScheme: "https",
  },
};

export default config;
