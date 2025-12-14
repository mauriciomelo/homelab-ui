import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    include: ['./**/*browser.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      // Use the same browser context for all tests
      instances: [
        { browser: 'chromium', viewport: { width: 1440, height: 920 } },
      ],
    },
  },
});
