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

test('renders the Apps page at Galaxy S25 Ultra portrait size', async ({
  worker,
}) => {
  await page.viewport(412, 891);
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

  await expect
    .element(page.getByRole('heading', { name: 'Apps', exact: true }))
    .toBeInTheDocument();
  await expect
    .poll(() => page.getByRole('row').elements().length)
    .toBe(apps.length + 1);
  await expect
    .element(page.getByRole('button', { name: 'Create App' }))
    .toBeInTheDocument();
  await expect
    .poll(() => Array.from(document.images).every((image) => image.complete))
    .toBe(true);
  await document.fonts.ready;
  hideCursor();

  const user = userEvent.setup();
  const menuButton = page.getByRole('button', { name: 'Open navigation' });
  await expect.element(menuButton).toBeVisible();
  await expect
    .element(page.getByRole('link', { name: 'Dashboard', exact: true }))
    .not.toBeInTheDocument();
  await expect(page).toMatchScreenshot('apps-galaxy-s25-ultra.png', {
    screenshotOptions: { fullPage: false, scale: 'css' },
  });

  await user.click(menuButton);
  const navigation = page.getByRole('dialog', { name: 'Sidebar', exact: true });
  await expect.element(navigation).toBeVisible();
  for (const name of ['Dashboard', 'Apps', 'Devices', 'Settings']) {
    await expect
      .element(navigation.getByRole('link', { name, exact: true }))
      .toBeVisible();
  }
  hideCursor();
  await expect(page).toMatchScreenshot('apps-galaxy-s25-ultra-menu-open.png', {
    screenshotOptions: { fullPage: false, scale: 'css' },
  });

  await user.click(navigation.getByRole('link', { name: 'Apps', exact: true }));
  await expect.element(navigation).not.toBeInTheDocument();
  await user.click(menuButton);
  await user.click(page.getByRole('button', { name: 'Close navigation' }));
  await expect.element(navigation).not.toBeInTheDocument();
  await user.click(menuButton);
  await user.keyboard('{Escape}');
  await expect.element(navigation).not.toBeInTheDocument();
});
