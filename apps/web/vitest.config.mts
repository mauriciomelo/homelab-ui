import { configDefaults, defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const viewport = { width: 1920, height: 1080 };

const visualTestPattern = '**/*.visual.browser.test.tsx';
const browserTestPattern = '**/*.browser.test.tsx';

export default defineConfig({
  optimizeDeps: {
    include: [
      'vitest-browser-react',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
      'immer',
      'server-only',
    ],
  },
  plugins: [
    tsconfigPaths(),
    react(),
    nodePolyfills({
      include: ['assert'],
      globals: {
        process: true,
        Buffer: true,
      },
      protocolImports: true,
    }),
  ],
  test: {
    deps: {
      optimizer: {
        web: {
          enabled: false,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          setupFiles: ['./vitest.unit.setup.ts'],
          environment: 'jsdom',
          exclude: [...configDefaults.exclude, browserTestPattern],
        },
      },
      {
        extends: true,

        test: {
          name: 'browser',
          setupFiles: ['./vitest.browser.setup.ts'],
          include: [browserTestPattern],
          exclude: [...configDefaults.exclude, visualTestPattern],
          browser: {
            enabled: true,
            viewport,
            screenshotDirectory: './__screenshots__/browser',

            provider: playwright({
              contextOptions: {
                // Allow the viewport to be resized dynamically
                viewport: null,
              },
            }),
            screenshotFailures: false,
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'visual',
          setupFiles: ['./vitest.browser.setup.ts'],
          include: [visualTestPattern],

          browser: {
            enabled: true,
            headless: true,
            ui: false,
            provider: playwright({
              contextOptions: {
                // Set a high device scale factor for better screenshot quality
                deviceScaleFactor: 3,
              },
            }),
            screenshotFailures: false,
            instances: [
              {
                browser: 'chromium',
                viewport,
              },
            ],
          },
        },
      },
    ],
  },
});
