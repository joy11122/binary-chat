import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.joyanta.binarychat",
  appName: "Binary Chat",
  webDir: "out",
  server: { androidScheme: "https" },
};

export default config;
