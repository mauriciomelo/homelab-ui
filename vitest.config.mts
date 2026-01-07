import { configDefaults, defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          exclude: [...configDefaults.exclude, './**/*.browser.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['./**/*browser.test.tsx'],
          browser: {
            enabled: true,
            provider: playwright(),
            screenshotFailures: false,
            instances: [
              { browser: 'chromium', viewport: { width: 1440, height: 920 } },
            ],
          },
        },
      },
    ],
  },
});
