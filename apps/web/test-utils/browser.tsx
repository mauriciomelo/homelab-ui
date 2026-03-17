import { QueryProvider } from '@/lib/query-provider';
import { render } from 'vitest-browser-react';
import { test as testBase } from 'vitest';
import { worker } from './mocks/browser';
import { HttpResponse } from 'msw';
import Cursor from '@/app/(dashboard)/apps/Cursor';
import '../app/globals.css';

export function renderWithProviders(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <>
        <Cursor />
        <QueryProvider>{children}</QueryProvider>
      </>
    ),
  });
}

interface CustomFixtures {
  worker: { use: typeof worker.use };
}

export * from './userEvent';

export const test = testBase.extend<CustomFixtures>({
  worker: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await worker.start({
        quiet: true,
        onUnhandledRequest(request, print) {
          // Ignore any requests containing "cdn.com" in their URL.
          if (request.url.includes('https://cdn.simpleicons.org')) {
            return;
          }

          // Otherwise, print an unhandled request warning.
          print.warning();
        },
      });

      // Expose the worker object on the test's context
      await use(worker);

      // Remove any request handlers added in individual test cases
      worker.resetHandlers();

      // Stop the worker after the test
      await worker.stop();
    },
    {
      auto: true,
    },
  ],
});

export function orpcJsonResponse(data: unknown) {
  return HttpResponse.json({
    json: data,
  });
}
