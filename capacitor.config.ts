import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "rs.aichatbot.safenest",
  appName: "SafeNest AI",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    Camera: {
      // iOS Info.plist and Android permissions are added by `npx cap sync`
    },
  },
};

export default config;
