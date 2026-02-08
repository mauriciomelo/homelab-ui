import { configDefaults, defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const viewport = { width: 1920, height: 1080 };

export default defineConfig({
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
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          setupFiles: ['./vitest.unit.setup.ts'],
          environment: 'jsdom',
          exclude: [...configDefaults.exclude, './**/*.browser.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          setupFiles: ['./vitest.browser.setup.ts'],
          include: ['./**/*browser.test.tsx'],
          browser: {
            enabled: true,
            viewport,
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
    ],
  },
});
