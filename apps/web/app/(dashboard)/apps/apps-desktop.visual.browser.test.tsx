import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { produce } from 'immer';
import { http, HttpResponse } from 'msw';
import { expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import DashboardLayout from '../layout';
import { Apps } from './apps';
import { hideCursor } from './Cursor';
import {
  orpcEventStreamResponse,
  renderWithProviders,
  test,
  userEvent,
} from '@/test-utils/browser';
import { baseApp } from '@/test-utils/fixtures';

vi.mock('server-only', () => ({}));

test('renders desktop navigation expanded, collapsed, and expanded again', async ({
  worker,
}) => {
  await page.viewport(1440, 920);
  const apps = [
    'forgejo',
    'frigate',
    'jellyfin',
    'opencode',
    'openwebui',
    'podinfo',
    'syncthing',
  ].map((name) =>
    produce(baseApp, (app) => {
      app.app.metadata.name = name;
    }),
  );
  worker.use(
    http.post('*/api/app/rpc/apps/watchApps', () =>
      orpcEventStreamResponse([apps]),
    ),
    http.get('https://cdn.simpleicons.org/:name', () => HttpResponse.error()),
    http.get('https://github.com/mauriciomelo.png', () => HttpResponse.error()),
  );
  const rootRoute = createRootRoute({ component: Outlet });
  const appsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/apps',
    component: () => (
      <DashboardLayout>
        <Apps />
      </DashboardLayout>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([appsRoute]),
    history: createMemoryHistory({ initialEntries: ['/apps'] }),
  });
  await router.load();
  await renderWithProviders(<RouterProvider router={router} />);
  const heading = page.getByRole('heading', { name: 'Apps', exact: true });
  await expect.element(heading).toBeVisible();
  await expect
    .poll(() => page.getByRole('row').elements().length)
    .toBe(apps.length + 1);
  await expect
    .poll(() => Array.from(document.images).every((image) => image.complete))
    .toBe(true);
  await document.fonts.ready;

  const user = userEvent.setup();
  // The original toggle is unlabeled; shadcn labels it "Toggle Sidebar".
  const toggle = page.getByRole('button', { name: /^(Toggle Sidebar)?$/ });
  await expect.element(toggle).toBeVisible();
  const screenshotOptions = {
    fullPage: false,
    scale: 'css',
  } satisfies import('vitest/browser').ScreenshotOptions;

  await user.hover(heading);
  hideCursor();
  await expect(page).toMatchScreenshot('apps-desktop-expanded.png', {
    screenshotOptions,
  });

  await user.click(toggle);
  await user.hover(heading);
  hideCursor();
  await expect(page).toMatchScreenshot('apps-desktop-collapsed.png', {
    screenshotOptions,
  });

  await user.click(toggle);
  await user.hover(heading);
  hideCursor();
  await expect(page).toMatchScreenshot('apps-desktop-expanded.png', {
    screenshotOptions,
  });
});
