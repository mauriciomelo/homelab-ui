import '../../globals.css';
import * as actions from './actions';
import { describe, expect, vi } from 'vitest';
import { http } from 'msw';
import {
  userEvent,
  renderWithProviders,
  test,
  trpcJsonResponse,
} from '@/test-utils/browser';
import { baseApp } from '@/test-utils/fixtures';
import { produce } from 'immer';
import { Apps } from './apps';
import { page } from 'vitest/browser';

vi.mock('server-only', () => ({}));
vi.mock('./actions', () => {
  return {
    updateApp: vi.fn(),
  };
});

describe('Apps Page', () => {
  test('renders the Apps component with table', async () => {
    await renderWithProviders(<Apps />);

    // Check if table is rendered
    const table = page.getByRole('table');
    expect(table).toBeDefined();

    // Check table caption
    const caption = page.getByText('A list of your installed Apps.');
    expect(caption).toBeDefined();
  });

  test('displays list of applications', async ({ worker }) => {
    worker.use(
      http.get('*/api/trpc/apps', () => {
        return trpcJsonResponse([
          produce(baseApp, (app) => {
            app.spec.name = 'myapp';
          }),
          produce(baseApp, (app) => {
            app.spec.name = 'homeassistant';
          }),
        ]);
      }),
    );
    await renderWithProviders(<Apps />);

    expect(page.getByText('myapp')).toBeDefined();
    expect(page.getByText('homeassistant')).toBeDefined();
  });

  test('opens form sheet when clicking on an app row', async ({ worker }) => {
    const user = userEvent.setup();
    worker.use(
      http.get('*/api/trpc/apps', () => {
        return trpcJsonResponse([
          produce(baseApp, (app) => {
            app.spec.name = 'myapp';
          }),
        ]);
      }),
    );

    await renderWithProviders(<Apps />);

    await user.click(page.getByText('myapp'));

    expect(page.getByText("Edit the App's configuration.")).toBeDefined();
  });
});

describe('ApplicationForm', () => {
  describe('update application', () => {
    test('populates form fields with initial data', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'my-app';
              app.spec.image = 'postgres:16';
              app.spec.envVariables = [
                { name: 'DB_NAME', value: 'production' },
              ];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('my-app'));

      const nameInput = page.getByPlaceholder('App Name');
      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const envNameInput = page.getByPlaceholder('VARIABLE_NAME');
      const envValueInput = page.getByPlaceholder('value');

      await expect.element(nameInput).toHaveValue('my-app');
      await expect.element(imageInput).toHaveValue('postgres:16');
      await expect.element(envNameInput).toHaveValue('DB_NAME');
      await expect.element(envValueInput).toHaveValue('production');
    });

    test('adds new environment variable', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.image = 'nginx:latest';
              app.spec.envVariables = [{ name: 'VAR1', value: 'value1' }];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('test-app'));

      await user.click(page.getByText('Add Environment Variable'));

      await expect
        .poll(() => page.getByPlaceholder('VARIABLE_NAME').elements().length)
        .toBe(2);
    });

    test('handles successful update', async ({ worker }) => {
      vi.mocked(actions.updateApp).mockResolvedValue({ success: true });
      const user = userEvent.setup();

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.image = 'nginx:latest';
              app.spec.envVariables = [{ name: 'OLD_VAR', value: 'old_value' }];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet for the app
      await user.click(await page.getByText('test-app'));

      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const nameInput = page.getByPlaceholder('VARIABLE_NAME');
      const valueInput = page.getByPlaceholder('value');

      await user.fill(imageInput, 'redis:7-alpine');

      await user.fill(nameInput, 'NEW_VAR');
      await user.fill(valueInput, 'new_value');

      await expect.element(nameInput).toHaveValue('NEW_VAR');
      await expect.element(valueInput).toHaveValue('new_value');

      await user.click(page.getByText('Update'));

      await expect
        .poll(() => vi.mocked(actions.updateApp))
        .toHaveBeenCalledWith({
          name: 'test-app',
          image: 'redis:7-alpine',
          envVariables: [{ name: 'NEW_VAR', value: 'new_value' }],
        });
    });

    test('app name field is readonly', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'locked-app';
              app.spec.image = 'nginx:latest';
              app.spec.envVariables = [{ name: 'VAR', value: 'val' }];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('locked-app'));

      const nameInput = page.getByPlaceholder('App Name');
      await expect.element(nameInput).toHaveAttribute('readonly');
    });

    test('renders multiple environment variables correctly', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.image = 'nginx:latest';
              app.spec.envVariables = [
                { name: 'VAR1', value: 'value1' },
                { name: 'VAR2', value: 'value2' },
                { name: 'VAR3', value: 'value3' },
              ];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('test-app'));

      const nameInputs = page.getByPlaceholder('VARIABLE_NAME').elements();
      const valueInputs = page.getByPlaceholder('value').elements();

      await expect.poll(() => nameInputs.length).toBe(3);
      await expect.poll(() => valueInputs.length).toBe(3);

      await expect.element(nameInputs[0]).toHaveValue('VAR1');
      await expect.element(valueInputs[0]).toHaveValue('value1');
      await expect.element(nameInputs[1]).toHaveValue('VAR2');
      await expect.element(valueInputs[1]).toHaveValue('value2');
      await expect.element(nameInputs[2]).toHaveValue('VAR3');
      await expect.element(valueInputs[2]).toHaveValue('value3');
    });
  });
});
