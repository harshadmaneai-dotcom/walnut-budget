import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.walnut.mobile',
  appName: 'Walnut',
  webDir: 'dist',
  android: {
    backgroundColor: '#0e3b2a',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
    },
  },
};

export default config;
