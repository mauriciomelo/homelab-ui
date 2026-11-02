import { join } from 'node:path';
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
      '@base-ui/react',
      '@hookform/lenses',
      '@hookform/resolvers/standard-schema',
      '@lucide/lab',
      '@orpc/client',
      '@orpc/client/fetch',
      '@orpc/tanstack-query',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tooltip',
      '@react-spring/three',
      '@react-spring/web',
      '@react-three/drei',
      '@react-three/fiber',
      '@tanstack/react-query',
      'assert',
      'class-variance-authority',
      'lodash/capitalize',
      'lodash/get',
      'lucide-react',
      'radix-ui',
      'react-hook-form',
      'three',
      'yaml',
      'zod',
      'zod/v4',
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
    reporters:
      process.env.VITEST_HTML_REPORT === '1'
        ? [
            ...configDefaults.reporters,
            ['html', { outputDir: '.vitest/report', singleFile: true }],
          ]
        : configDefaults.reporters,
    deps: {
      optimizer: {
        client: {
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
              connectOptions: {
                wsEndpoint:
                  process.env.PLAYWRIGHT_WS_ENDPOINT ?? 'ws://127.0.0.1:0',
                exposeNetwork: '<loopback>',
              },
              contextOptions: {
                deviceScaleFactor: 3,
                locale: 'en-US',
                timezoneId: 'UTC',
                colorScheme: 'light',
                reducedMotion: 'reduce',
              },
            }),
            expect: {
              toMatchScreenshot: {
                resolveScreenshotPath: ({
                  root,
                  testFileDirectory,
                  screenshotDirectory,
                  testFileName,
                  arg,
                  ext,
                }) =>
                  join(
                    root,
                    testFileDirectory,
                    screenshotDirectory,
                    testFileName,
                    `${arg}${ext}`,
                  ),
                resolveDiffPath: ({
                  root,
                  attachmentsDir,
                  testFileDirectory,
                  testFileName,
                  arg,
                  ext,
                }) =>
                  join(
                    root,
                    attachmentsDir,
                    testFileDirectory,
                    testFileName,
                    `${arg}${ext}`,
                  ),
              },
            },
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
