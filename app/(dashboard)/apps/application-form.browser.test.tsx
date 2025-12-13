import '../../globals.css';
import * as actions from './actions';
import { describe, expect, vi } from 'vitest';
import { http } from 'msw';
import {
  renderWithProviders,
  test,
  trpcJsonResponse,
} from '@/test-utils/browser';
import { baseApp } from '@/test-utils/fixtures';
import { produce } from 'immer';
import { Apps } from './apps';

vi.mock('server-only', () => ({}));
vi.mock('./actions', () => {
  return {
    updateApp: vi.fn(),
  };
});

describe('Apps Page', () => {
  test('renders the Apps component with table', async () => {
    const screen = await renderWithProviders(<Apps />);

    // Check if table is rendered
    const table = screen.getByRole('table');
    expect(table).toBeDefined();

    // Check table caption
    const caption = screen.getByText('A list of your installed Apps.');
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
    const screen = await renderWithProviders(<Apps />);

    expect(screen.getByText('myapp')).toBeDefined();
    expect(screen.getByText('homeassistant')).toBeDefined();
  });

  test('opens form sheet when clicking on an app row', async ({ worker }) => {
    worker.use(
      http.get('*/api/trpc/apps', () => {
        return trpcJsonResponse([
          produce(baseApp, (app) => {
            app.spec.name = 'myapp';
          }),
        ]);
      }),
    );

    const screen = await renderWithProviders(<Apps />);

    const appRow = screen.getByText('myapp');
    await appRow.click();

    expect(
      screen.getByText("Edit the App's configuration."),
    ).toBeInTheDocument();
  });
});

describe('ApplicationForm', () => {
  describe('update application', () => {
    test('populates form fields with initial data', async ({ worker }) => {
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

      const screen = await renderWithProviders(<Apps />);
      const { getByPlaceholder } = screen;

      // Open the form sheet
      const appRow = screen.getByText('my-app');
      await appRow.click();

      const nameInput = getByPlaceholder('App Name');
      const imageInput = getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const envNameInput = getByPlaceholder('VARIABLE_NAME');
      const envValueInput = getByPlaceholder('value');

      await expect.element(nameInput).toHaveValue('my-app');
      await expect.element(imageInput).toHaveValue('postgres:16');
      await expect.element(envNameInput).toHaveValue('DB_NAME');
      await expect.element(envValueInput).toHaveValue('production');
    });

    test('adds new environment variable', async ({ worker }) => {
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

      const renderScreen = await renderWithProviders(<Apps />);

      // Open the form sheet
      const appRow = renderScreen.getByText('test-app');
      await appRow.click();

      const addButton = renderScreen.getByText('Add Environment Variable');
      await addButton.click();

      await expect
        .poll(
          () =>
            renderScreen.getByPlaceholder('VARIABLE_NAME').elements().length,
        )
        .toBe(2);
    });

    test('handles successful update', async ({ worker }) => {
      vi.mocked(actions.updateApp).mockResolvedValue({ success: true });

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

      const screen = await renderWithProviders(<Apps />);
      const { getByPlaceholder, getByText } = screen;

      // Open the form sheet
      const appRow = screen.getByText('test-app');
      await appRow.click();

      const imageInput = getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const nameInput = getByPlaceholder('VARIABLE_NAME');
      const valueInput = getByPlaceholder('value');

      await imageInput.fill('redis:7-alpine');
      await nameInput.fill('NEW_VAR');
      await valueInput.fill('new_value');

      await expect.element(imageInput).toHaveValue('redis:7-alpine');
      await expect.element(nameInput).toHaveValue('NEW_VAR');
      await expect.element(valueInput).toHaveValue('new_value');

      const submitButton = getByText('Update');
      await submitButton.click();

      await expect
        .poll(() => vi.mocked(actions.updateApp))
        .toHaveBeenCalledWith({
          name: 'test-app',
          image: 'redis:7-alpine',
          envVariables: [{ name: 'NEW_VAR', value: 'new_value' }],
        });
    });

    test('app name field is readonly', async ({ worker }) => {
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

      const screen = await renderWithProviders(<Apps />);
      const { getByPlaceholder } = screen;

      // Open the form sheet
      const appRow = screen.getByText('locked-app');
      await appRow.click();

      const nameInput = getByPlaceholder('App Name');
      await expect.element(nameInput).toHaveAttribute('readonly');
    });

    test('renders multiple environment variables correctly', async ({
      worker,
    }) => {
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

      const screen = await renderWithProviders(<Apps />);
      const { getByPlaceholder, getByText } = screen;

      // Open the form sheet
      const appRow = await getByText('test-app');
      await appRow.click();

      const nameInputs = getByPlaceholder('VARIABLE_NAME').elements();
      const valueInputs = getByPlaceholder('value').elements();

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
