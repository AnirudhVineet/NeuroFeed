import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neurofeed.app',
  appName: 'NeuroFeed',
  webDir: 'dist',
  server: {
    // USB tunneling: phone loads the Vite dev server via `adb reverse tcp:5173
    // tcp:5173` (so localhost on the phone forwards through the USB cable to
    // the laptop). Works regardless of WiFi state. Run `adb reverse tcp:5173
    // tcp:5173 && adb reverse tcp:8000 tcp:8000` after each USB reconnect.
    url: 'http://localhost:5173',
    cleartext: true,
  },
};

export default config;
