import '../../globals.css';
import * as actions from './actions';
import { beforeEach, describe, expect, vi } from 'vitest';
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
    createApp: vi.fn(),
  };
});

describe('Apps Page', () => {
  test('renders the Apps component with table', async ({ worker }) => {
    // macbook  resolution
    const scale = 1;
    page.viewport(1440 * scale, 920 * scale);
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

    // Check if table is rendered
    const table = page.getByRole('table');
    expect(table).toBeInTheDocument();

    // Check table caption
    const caption = page.getByText('A list of your installed Apps.');
    expect(caption).toBeInTheDocument();

    await expect.poll(() => page.getByText('myapp')).toBeInTheDocument();
    await expect
      .poll(() => page.getByText('homeassistant'))
      .toBeInTheDocument();

    await page.screenshot({});
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

    await expect.poll(() => page.getByText('myapp')).toBeInTheDocument();
    await expect
      .poll(() => page.getByText('homeassistant'))
      .toBeInTheDocument();
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

    expect(page.getByText("Edit the App's configuration.")).toBeInTheDocument();
  });
});

describe('ApplicationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('displays validation error when CPU is 0', async ({ worker }) => {
    const user = userEvent.setup();
    worker.use(
      http.get('*/api/trpc/apps', () => {
        return trpcJsonResponse([
          produce(baseApp, (app) => {
            app.spec.name = 'test-app';
            app.spec.resources.limits = { cpu: '500m', memory: '512Mi' };
          }),
        ]);
      }),
    );

    await renderWithProviders(<Apps />);
    await user.click(await page.getByText('test-app'));

    await user.click(page.getByRole('combobox', { name: 'Resource Limits' }));
    await user.click(page.getByRole('option', { name: 'Custom' }));

    const cpuInput = page.getByTestId('resource-limits-cpu-input');
    await user.fill(cpuInput, '');

    const updateButton = page.getByText('Update');
    await user.click(updateButton);

    await expect
      .poll(() => page.getByText(/CPU must be greater than 0/))
      .toBeInTheDocument();
  });

  test('displays validation error when Memory is 0', async ({ worker }) => {
    const user = userEvent.setup();
    worker.use(
      http.get('*/api/trpc/apps', () => {
        return trpcJsonResponse([
          produce(baseApp, (app) => {
            app.spec.name = 'test-app';
            app.spec.resources.limits = { cpu: '500m', memory: '512Mi' };
          }),
        ]);
      }),
    );

    await renderWithProviders(<Apps />);
    await user.click(await page.getByText('test-app'));

    await user.click(page.getByRole('combobox', { name: 'Resource Limits' }));
    await user.click(page.getByRole('option', { name: 'Custom' }));

    const memoryInput = page.getByTestId('resource-limits-memory-input');
    await user.fill(memoryInput, '');

    const updateButton = page.getByText('Update');
    await user.click(updateButton);

    await expect
      .poll(() => page.getByText(/Memory must be greater than 0/))
      .toBeInTheDocument();
  });

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
              app.spec.ingress = { port: { name: 'http' } };
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

      const portSelect = page.getByTestId('ingress-port-select');
      await expect.element(portSelect).toHaveTextContent('http');

      const portNameInput = page.getByTestId('port-name-0');
      const portNumberInput = page.getByTestId('port-number-0');

      await expect.element(portNameInput).toHaveValue('http');
      await expect.element(portNumberInput).toHaveValue(80);
    });

    test('renders existing auth clients', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'auth-app';
              app.spec.additionalResources = [
                {
                  apiVersion: 'tesselar.io/v1',
                  kind: 'AuthClient',
                  metadata: { name: 'authclient-main' },
                  spec: {
                    redirectUris: ['https://example.com/callback'],
                    postLogoutRedirectUris: ['https://example.com/logout'],
                  },
                },
              ];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('auth-app'));

      await expect
        .element(page.getByText('Additional Resources'))
        .toBeInTheDocument();
      const authClientNameInput = page.getByLabelText('Auth Client Name');
      const redirectUriInput = page.getByLabelText('Redirect URI');
      const postLogoutUriInput = page.getByLabelText('Post-logout URI');

      await expect.element(authClientNameInput).toHaveValue('authclient-main');
      await expect
        .element(redirectUriInput)
        .toHaveValue('https://example.com/callback');
      await expect
        .element(postLogoutUriInput)
        .toHaveValue('https://example.com/logout');
    });

    test('adds auth client from additional resources', async ({ worker }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'auth-app';
        app.spec.additionalResources = [];
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('auth-app'));

      await user.click(page.getByRole('button', { name: 'Add Resource' }));
      await user.click(page.getByRole('menuitem', { name: 'Auth Client' }));

      await expect
        .poll(() => page.getByLabelText('Auth Client Name'))
        .toBeInTheDocument();
      await expect
        .poll(() => page.getByLabelText('Redirect URI'))
        .toBeInTheDocument();
    });

    test('sets a default auth client name', async ({ worker }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'default-auth-app';
        app.spec.additionalResources = [];
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('default-auth-app'));

      await user.click(page.getByRole('button', { name: 'Add Resource' }));
      await user.click(page.getByRole('menuitem', { name: 'Auth Client' }));

      await expect
        .poll(() => page.getByLabelText('Auth Client Name'))
        .toHaveValue('authclient');
    });

    test('adds optional post-logout redirect uris', async ({ worker }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'logout-auth-app';
        app.spec.additionalResources = [];
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('logout-auth-app'));

      await user.click(page.getByRole('button', { name: 'Add Resource' }));
      await user.click(page.getByRole('menuitem', { name: 'Auth Client' }));

      const postLogoutInput = page.getByLabelText('Post-logout URI');
      await user.click(postLogoutInput);
      await user.keyboard(
        'https://example.com/logout, https://example.com/logout-next',
      );

      await expect
        .element(postLogoutInput)
        .toHaveValue(
          'https://example.com/logout, https://example.com/logout-next',
        );
    });

    test('shows validation error for invalid redirect uri', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'invalid-auth-app';
        app.spec.additionalResources = [];
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('invalid-auth-app'));

      await user.click(page.getByRole('button', { name: 'Add Resource' }));
      await user.click(page.getByRole('menuitem', { name: 'Auth Client' }));

      const redirectInput = page.getByLabelText('Redirect URI');
      await user.click(redirectInput);
      await user.keyboard('https://example.com/callback, not-a-url');

      await user.click(page.getByText('Update'));

      await expect
        .poll(
          () =>
            page.getByText('Redirect URI must be a valid URL').elements()
              .length,
        )
        .toBe(1);
    });

    test('manages multiple auth clients', async ({ worker }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'multi-auth-app';
        app.spec.additionalResources = [];
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('multi-auth-app'));

      await user.click(page.getByRole('button', { name: 'Add Resource' }));
      await user.click(page.getByRole('menuitem', { name: 'Auth Client' }));

      await user.click(page.getByRole('button', { name: 'Add Resource' }));
      await user.click(page.getByRole('menuitem', { name: 'Auth Client' }));

      await expect
        .poll(() => page.getByLabelText('Auth Client Name').elements().length)
        .toBe(2);

      const authClientNames = page.getByLabelText('Auth Client Name');
      await user.fill(authClientNames.nth(0), 'primary-client');
      await user.fill(authClientNames.nth(1), 'secondary-client');

      await user.click(
        page.getByRole('button', { name: 'Remove Auth Client' }).nth(0),
      );

      await expect
        .poll(() => page.getByLabelText('Auth Client Name').elements().length)
        .toBe(1);
      await expect
        .element(page.getByLabelText('Auth Client Name'))
        .toHaveValue('secondary-client');
    });

    test('renders multiple ports correctly', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.ports = [
                { name: 'http', containerPort: 80 },
                { name: 'metrics', containerPort: 9090 },
              ];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('test-app'));

      const portNameInput0 = page.getByTestId('port-name-0');
      const portNumberInput0 = page.getByTestId('port-number-0');
      const portNameInput1 = page.getByTestId('port-name-1');
      const portNumberInput1 = page.getByTestId('port-number-1');

      await expect.element(portNameInput0).toHaveValue('http');
      await expect.element(portNumberInput0).toHaveValue(80);
      await expect.element(portNameInput1).toHaveValue('metrics');
      await expect.element(portNumberInput1).toHaveValue(9090);
    });

    test('adds new port', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.ports = [{ name: 'http', containerPort: 80 }];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('test-app'));

      await user.click(page.getByTestId('add-port-btn'));

      await expect
        .poll(() => page.getByTestId('port-name-1'))
        .toBeInTheDocument();
    });

    test('removes port', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.ports = [
                { name: 'http', containerPort: 80 },
                { name: 'metrics', containerPort: 9090 },
              ];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('test-app'));

      // Verify we have 2 ports initially
      await expect.element(page.getByTestId('port-name-0')).toBeInTheDocument();
      await expect.element(page.getByTestId('port-name-1')).toBeInTheDocument();

      // Click remove on the second port
      await user.click(page.getByTestId('remove-port-1'));

      // Verify second port is gone
      await expect
        .poll(() => page.getByTestId('port-name-1').elements().length)
        .toBe(0);

      // Verify first port is still there
      await expect.element(page.getByTestId('port-name-0')).toBeInTheDocument();
    });

    test('updates ingress port options when ports change', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.ports = [{ name: 'http', containerPort: 80 }];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('test-app'));

      // Check initial ingress port
      const portSelect = page.getByTestId('ingress-port-select');
      await expect.element(portSelect).toHaveTextContent('http');

      // Add a new port
      await user.click(page.getByTestId('add-port-btn'));
      const newPortNameInput = page.getByTestId('port-name-1');
      await user.fill(newPortNameInput, 'metrics');

      // Open select
      await user.click(portSelect);

      // Check if new option is available
      await expect
        .element(page.getByTestId('ingress-port-option-metrics'))
        .toBeInTheDocument();

      // Select the new port
      await user.click(page.getByTestId('ingress-port-option-metrics'));
      await expect.element(portSelect).toHaveTextContent('metrics');
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
              app.spec.ingress = { port: { name: 'http' } };
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
      const portSelect = page.getByTestId('ingress-port-select');

      await expect.element(portSelect).toHaveTextContent('http');

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
          ports: [{ name: 'http', containerPort: 80 }],
          envVariables: [{ name: 'NEW_VAR', value: 'new_value' }],
          resources: {
            limits: { cpu: '1000m', memory: '1Gi' },
          },
          ingress: { port: { name: 'http' } },
        });
    });

    test('handles custom resource limits', async ({ worker }) => {
      vi.mocked(actions.updateApp).mockResolvedValue({ success: true });
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'test-app';
        // sizeToResources.small.limits is used to determine 'small' is selected
        // but baseApp already has string resource limits that need to match
        app.spec.resources.limits = { cpu: '500m', memory: '512Mi' };
        app.spec.ingress = { port: { name: 'http' } };
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(await page.getByText(app.spec.name));

      // Check current resource limits selection
      await expect(
        page.getByRole('combobox', { name: 'Resource Limits' }),
      ).toHaveTextContent('small');

      // Click on the resource limits select to open it
      await user.click(page.getByRole('combobox', { name: 'Resource Limits' }));

      // Select Custom option
      await user.click(page.getByRole('option', { name: 'Custom' }));

      // Wait for custom input fields to appear
      const cpuInput = page.getByTestId('resource-limits-cpu-input');
      const memoryInput = page.getByTestId('resource-limits-memory-input');

      await expect.element(cpuInput).toBeInTheDocument();
      await expect.element(memoryInput).toBeInTheDocument();

      // Fill in custom values
      await user.fill(cpuInput, '750');
      await user.fill(memoryInput, '768');

      // Submit the form
      await user.click(page.getByText('Update'));

      // Verify the action was called with custom values
      await expect
        .poll(() => vi.mocked(actions.updateApp))
        .toHaveBeenCalledWith({
          ...app.spec,
          resources: {
            limits: { cpu: '750m', memory: '768Mi' },
          },
          ingress: { port: { name: 'http' } },
        });
    });

    test('pre-populates custom fields when switching from medium to custom', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'medium-app';
        app.spec.resources.limits = { cpu: '1', memory: '1Gi' };
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);
      await user.click(await page.getByText(app.spec.name));

      await expect(
        page.getByRole('combobox', { name: 'Resource Limits' }),
      ).toHaveTextContent('medium');

      await user.click(page.getByRole('combobox', { name: 'Resource Limits' }));
      await user.click(page.getByRole('option', { name: 'Custom' }));

      const cpuInput = page.getByTestId('resource-limits-cpu-input');
      const memoryInput = page.getByTestId('resource-limits-memory-input');

      await expect.element(cpuInput).toHaveValue('1');
      await expect.element(memoryInput).toHaveValue('1');
      await expect(
        page.getByRole('combobox', { name: 'memory unit' }),
      ).toHaveTextContent('Gi');
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

    test('displays validation error when port names are not unique', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.ports = [{ name: 'http', containerPort: 80 }];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);
      await user.click(await page.getByText('test-app'));

      await user.click(page.getByTestId('add-port-btn'));
      const newPortNameInput = page.getByTestId('port-name-1');
      await user.fill(newPortNameInput, 'http');

      await user.click(page.getByText('Update'));

      await expect
        .poll(() => page.getByText(/Port name must be unique/))
        .toBeInTheDocument();
    });

    test('displays validation error when port numbers are not unique', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.ports = [{ name: 'http', containerPort: 80 }];
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);
      await user.click(await page.getByText('test-app'));

      await user.click(page.getByTestId('add-port-btn'));
      const newPortNameInput = page.getByTestId('port-name-1');
      await user.fill(newPortNameInput, 'metrics');
      const newPortNumberInput = page.getByTestId('port-number-1');
      await user.fill(newPortNumberInput, '80');

      await user.click(page.getByText('Update'));

      await expect
        .poll(() => page.getByText(/Port number must be unique/))
        .toBeInTheDocument();
    });
  });

  describe('create application', () => {
    test('handles successful app creation', async ({ worker }) => {
      vi.mocked(actions.createApp).mockResolvedValue({ success: true });
      const user = userEvent.setup();

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('Create App'));

      expect(page.getByText('Create New App')).toBeInTheDocument();

      const portSelect = page.getByTestId('ingress-port-select');
      await expect.element(portSelect).toHaveTextContent('http');

      const nameInput = page.getByPlaceholder('App Name');
      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const envNameInput = page.getByPlaceholder('VARIABLE_NAME');
      const envValueInput = page.getByPlaceholder('value');

      await expect.element(nameInput).not.toHaveAttribute('readonly');

      await user.fill(nameInput, 'new-app');
      await user.fill(imageInput, 'redis:7-alpine');
      await user.fill(envNameInput, 'REDIS_HOST');
      await user.fill(envValueInput, 'localhost');

      await user.click(page.getByRole('button', { name: 'Create' }));

      await expect
        .poll(() => vi.mocked(actions.createApp))
        .toHaveBeenCalledWith({
          name: 'new-app',
          image: 'redis:7-alpine',
          ports: [{ name: 'http', containerPort: 80 }],
          envVariables: [{ name: 'REDIS_HOST', value: 'localhost' }],
          resources: {
            limits: { cpu: '500m', memory: '512Mi' },
          },
          ingress: { port: { name: 'http' } },
        });
    });
  });
});
