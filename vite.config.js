import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

// Auto-increments a build counter (stored in .build-count) on every
// production build and exposes it as __APP_BUILD__ so the displayed
// version counts up automatically with each publish.
function stackdBuildVersion() {
  let incremented = false;
  return {
    name: 'stackd-build-version',
    config(_config, { command }) {
      const countPath = path.resolve(process.cwd(), '.build-count');
      let buildNumber = existsSync(countPath)
        ? parseInt(readFileSync(countPath, 'utf8').trim(), 10) || 100
        : 100;
      if (command === 'build' && !incremented) {
        buildNumber += 1;
        incremented = true;
        writeFileSync(countPath, String(buildNumber));
      }
      return { define: { __APP_BUILD__: String(buildNumber) } };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    stackdBuildVersion(),
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ]
});