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
import { baseApp, basePersistentVolumeClaim } from '@/test-utils/fixtures';
import { produce } from 'immer';
import { Apps } from './apps';
import { page } from 'vitest/browser';
import YAML from 'yaml';
import { resourceLimitPreset } from '@/lib/resource-utils';

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

    await user.click(page.getByRole('combobox', { name: 'Preset' }));
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

    await user.click(page.getByRole('combobox', { name: 'Preset' }));
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
      const openwebuiApp = produce(baseApp, (app) => {
        app.spec.name = 'openwebui';
        app.spec.image = 'ghcr.io/open-webui/open-webui:main';
        app.spec.ports = [{ name: 'web', containerPort: 8080 }];
        app.spec.envVariables = [
          {
            name: 'OAUTH_CLIENT_ID',
            valueFrom: {
              secretKeyRef: {
                name: 'openwebui-auth-client',
                key: 'client-id',
              },
            },
          },
          {
            name: 'OAUTH_CLIENT_SECRET',
            valueFrom: {
              secretKeyRef: {
                name: 'openwebui-auth-client',
                key: 'client-secret',
              },
            },
          },
          { name: 'OAUTH_PROVIDER_NAME', value: 'tesselar' },
          {
            name: 'OPENID_PROVIDER_URL',
            value:
              'https://zitadel.home.example.com/.well-known/openid-configuration',
          },
          {
            name: 'OPENID_REDIRECT_URI',
            value: 'https://openwebui.home.example.com/oauth/oidc/callback',
          },
          {
            name: 'WEBUI_URL',
            value: 'https://openwebui.home.example.com',
          },
          { name: 'ENABLE_OAUTH_SIGNUP', value: 'true' },
          { name: 'ENABLE_LOGIN_FORM', value: 'false' },
          { name: 'OAUTH_MERGE_ACCOUNTS_BY_EMAIL', value: 'true' },
        ];
        app.spec.resources.limits = resourceLimitPreset.small.limits;
        app.spec.ingress = { port: { name: 'web' } };
        app.spec.health = {
          check: {
            type: 'httpGet',
            path: '/',
            port: 'web',
          },
        };
        app.spec.additionalResources = [
          {
            apiVersion: 'tesselar.io/v1',
            kind: 'AuthClient',
            metadata: { name: 'openwebui-auth-client' },
            spec: {
              redirectUris: [
                'https://openwebui.home.example.com/oauth/oidc/callback',
              ],
            },
          },
          {
            apiVersion: 'v1',
            kind: 'PersistentVolumeClaim',
            metadata: { name: 'openwebui-data-pvc' },
            spec: {
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'longhorn',
              resources: {
                requests: {
                  storage: '2Gi',
                },
              },
            },
          },
        ];
        app.spec.volumeMounts = [
          {
            name: 'openwebui-data',
            mountPath: '/app/backend/data',
          },
        ];
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([openwebuiApp]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('openwebui'));

      const nameInput = page.getByPlaceholder('App Name');
      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const envNameInputs = page.getByPlaceholder('VARIABLE_NAME');
      const envValueInputs = page.getByPlaceholder('value');

      await expect.element(nameInput).toHaveValue('openwebui');
      await expect
        .element(imageInput)
        .toHaveValue('ghcr.io/open-webui/open-webui:main');

      await expect.poll(() => envNameInputs.elements().length).toBe(9);
      await expect.poll(() => envValueInputs.elements().length).toBe(7);

      await expect.element(envNameInputs.nth(0)).toHaveValue('OAUTH_CLIENT_ID');
      await expect
        .element(envNameInputs.nth(1))
        .toHaveValue('OAUTH_CLIENT_SECRET');
      await expect.element(envNameInputs.nth(5)).toHaveValue('WEBUI_URL');
      await expect
        .element(envValueInputs.nth(3))
        .toHaveValue('https://openwebui.home.example.com');
      await expect
        .poll(() => page.getByText('Client ID').elements().length)
        .toBeGreaterThan(0);
      await expect
        .poll(() => page.getByText('Client Secret').elements().length)
        .toBeGreaterThan(0);

      await expect
        .element(page.getByRole('button', { name: /Web Port/ }).nth(0))
        .toHaveAttribute('aria-pressed', 'true');

      const portNameInput = page.getByLabelText('Port Name').nth(0);
      const portNumberInput = page.getByLabelText('Port Number').nth(0);

      await expect.element(portNameInput).toHaveValue('web');
      await expect.element(portNumberInput).toHaveValue(8080);

      const authClientNameInput = page
        .getByRole('group', { name: 'Auth Client' })
        .getByLabelText('Name');
      const redirectUriInput = page.getByLabelText('Redirect URIs');
      const pvcNameInput = page
        .getByRole('group', { name: 'Persistent Volume' })
        .getByLabelText('Name');
      const pvcStorageInput = page.getByRole('textbox', { name: 'Storage' });
      const mountPathInput = page.getByPlaceholder('/data');
      const mountVolumeSelect = page.getByRole('combobox', {
        name: 'Persistent Volume',
      });

      await expect
        .element(authClientNameInput)
        .toHaveValue('openwebui-auth-client');
      await expect
        .element(redirectUriInput)
        .toHaveValue('https://openwebui.home.example.com/oauth/oidc/callback');
      await expect.element(pvcNameInput).toHaveValue('openwebui-data-pvc');
      await expect.element(pvcStorageInput).toHaveValue('2');
      await expect.element(mountPathInput).toHaveValue('/app/backend/data');
      await expect
        .element(mountVolumeSelect)
        .toHaveTextContent('openwebui-data');
    });

    test('resets form when switching apps and creating new app', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      const appOne = produce(baseApp, (app) => {
        app.spec.name = 'app-one';
        app.spec.image = 'redis:7-alpine';
      });
      const appTwo = produce(baseApp, (app) => {
        app.spec.name = 'app-two';
        app.spec.image = 'nginx:1.27';
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([appOne, appTwo]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Step 1: open the first app
      await user.click(page.getByText('app-one'));

      const nameInput = page.getByPlaceholder('App Name');
      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );

      await expect.element(nameInput).toHaveValue('app-one');
      await expect.element(imageInput).toHaveValue('redis:7-alpine');

      await user.fill(imageInput, 'custom-image:1.0');

      // Step 2: open the second app and verify the form resets
      await user.keyboard('{Escape}');
      await user.click(page.getByText('app-two'));

      await expect.element(nameInput).toHaveValue('app-two');
      await expect.element(imageInput).toHaveValue('nginx:1.27');

      // Step 3: open create app and verify defaults are restored
      await user.keyboard('{Escape}');
      await user.click(page.getByText('Create App'));

      await expect.element(nameInput).toHaveValue('');
      await expect.element(imageInput).toHaveValue('');
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
        .element(page.getByText('Additional Resources', { exact: true }))
        .toBeInTheDocument();
      const authClientNameInput = page
        .getByRole('group', { name: 'Auth Client' })
        .getByLabelText('Name');
      const redirectUriInput = page.getByLabelText('Redirect URIs');
      const postLogoutUriInput = page.getByLabelText('Post-logout URIs');

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
        .poll(() =>
          page
            .getByRole('group', { name: 'Auth Client' })
            .getByLabelText('Name'),
        )
        .toBeInTheDocument();
      await expect
        .poll(() => page.getByLabelText('Redirect URIs'))
        .toBeInTheDocument();
    });

    test('adds persistent volume from additional resources', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'pvc-app';
        app.spec.additionalResources = [];
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('pvc-app'));

      await user.click(page.getByRole('button', { name: 'Add Resource' }));
      await user.click(
        page.getByRole('menuitem', { name: 'Persistent Volume' }),
      );

      const volumeNameInput = page
        .getByRole('group', { name: 'Persistent Volume' })
        .getByLabelText('Name');
      const storageInput = page.getByRole('textbox', { name: 'Storage' });
      const accessModeSelect = page.getByRole('combobox', {
        name: 'Access Mode',
      });
      const storageUnitSelect = page.getByRole('combobox', {
        name: 'storage unit',
      });

      await expect.element(volumeNameInput).toHaveValue('data');
      await expect.element(storageInput).toHaveValue('1');
      await expect.element(storageUnitSelect).toHaveTextContent('Gi');
      await expect.element(accessModeSelect).toHaveValue('ReadWriteOnce');
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
        .poll(() =>
          page
            .getByRole('group', { name: 'Auth Client' })
            .getByLabelText('Name'),
        )
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

      const postLogoutInput = page.getByLabelText('Post-logout URIs');
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

      const redirectInput = page.getByLabelText('Redirect URIs');
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
        .poll(
          () =>
            page
              .getByRole('group', { name: 'Auth Client' })
              .getByLabelText('Name')
              .elements().length,
        )
        .toBe(2);

      const authClientNames = page
        .getByRole('group', { name: 'Auth Client' })
        .getByLabelText('Name');
      await user.fill(authClientNames.nth(0), 'primary-client');
      await user.fill(authClientNames.nth(1), 'secondary-client');

      await user.click(
        page.getByRole('button', { name: 'Remove Auth Client' }).nth(0),
      );

      await expect
        .poll(
          () =>
            page
              .getByRole('group', { name: 'Auth Client' })
              .getByLabelText('Name')
              .elements().length,
        )
        .toBe(1);
      await expect
        .element(
          page
            .getByRole('group', { name: 'Auth Client' })
            .getByLabelText('Name'),
        )
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

      const portNameInput0 = page.getByLabelText('Port Name').nth(0);
      const portNumberInput0 = page.getByLabelText('Port Number').nth(0);
      const portNameInput1 = page.getByLabelText('Port Name').nth(1);
      const portNumberInput1 = page.getByLabelText('Port Number').nth(1);

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

      await user.click(page.getByRole('button', { name: 'Add Port' }));

      await expect
        .poll(() => page.getByLabelText('Port Name').nth(1))
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
      await expect
        .element(page.getByLabelText('Port Name').nth(0))
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText('Port Name').nth(1))
        .toBeInTheDocument();

      // Click remove on the second port
      await user.click(
        page.getByRole('button', { name: 'Remove Port' }).nth(1),
      );

      // Verify second port is gone
      await expect
        .poll(() => page.getByLabelText('Port Name').nth(1).elements().length)
        .toBe(0);

      // Verify first port is still there
      await expect
        .element(page.getByLabelText('Port Name').nth(0))
        .toBeInTheDocument();
    });

    test('updates web port when toggle is clicked', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([
            produce(baseApp, (app) => {
              app.spec.name = 'test-app';
              app.spec.ports = [{ name: 'http', containerPort: 80 }];
              app.spec.ingress = { port: { name: 'http' } };
            }),
          ]);
        }),
      );

      await renderWithProviders(<Apps />);

      // Open the form sheet
      await user.click(page.getByText('test-app'));

      // Check initial active web port
      await expect
        .element(page.getByRole('button', { name: /Web Port/ }).nth(0))
        .toHaveAttribute('aria-pressed', 'true');

      // Add a new port
      await user.click(page.getByRole('button', { name: 'Add Port' }));
      const newPortNameInput = page.getByLabelText('Port Name').nth(1);
      await user.fill(newPortNameInput, 'metrics');

      // Click toggle on new port
      await user.click(page.getByRole('button', { name: /Web Port/ }).nth(1));

      // Verify new port is active
      await expect
        .element(page.getByRole('button', { name: /Web Port/ }).nth(1))
        .toHaveAttribute('aria-pressed', 'true');

      // Verify old port is inactive
      await expect
        .element(page.getByRole('button', { name: /Web Port/ }).nth(0))
        .toHaveAttribute('aria-pressed', 'false');
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

      await user.click(page.getByText('Add Variable'));

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

      await expect
        .element(page.getByRole('button', { name: /Web Port/ }).nth(0))
        .toHaveAttribute('aria-pressed', 'true');

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
          health: undefined,
          additionalResources: [],
          volumeMounts: [],
        });
    });

    test('prompts before applying external updates while editing', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (draft) => {
        draft.spec.name = 'external-update-app';
        draft.spec.image = 'nginx:latest';
      });
      const updatedApp = produce(app, (draft) => {
        draft.spec.image = 'redis:7-alpine';
      });
      let responseCount = 0;

      worker.use(
        http.get('*/api/trpc/apps', () => {
          responseCount += 1;
          return trpcJsonResponse([responseCount === 1 ? app : updatedApp]);
        }),
      );

      await renderWithProviders(<Apps />);
      await user.click(await page.getByText('external-update-app'));

      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      await user.fill(imageInput, 'custom-image:1.0');

      await expect
        .poll(() => page.getByText('External update detected'), {
          timeout: 5000,
        })
        .toBeInTheDocument();

      await expect.element(imageInput).toHaveValue('custom-image:1.0');
      await user.click(page.getByRole('button', { name: 'Keep editing' }));
      await expect.element(imageInput).toHaveValue('custom-image:1.0');
    });

    test('applies external updates when confirmed', async ({ worker }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (draft) => {
        draft.spec.name = 'external-accept-app';
        draft.spec.image = 'nginx:latest';
      });
      const updatedApp = produce(app, (draft) => {
        draft.spec.image = 'redis:7-alpine';
      });
      let responseCount = 0;

      worker.use(
        http.get('*/api/trpc/apps', () => {
          responseCount += 1;
          return trpcJsonResponse([responseCount === 1 ? app : updatedApp]);
        }),
      );

      await renderWithProviders(<Apps />);
      await user.click(await page.getByText('external-accept-app'));

      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      await user.fill(imageInput, 'custom-image:1.0');

      await expect
        .poll(() => page.getByText('External update detected'), {
          timeout: 5000,
        })
        .toBeInTheDocument();

      await user.click(page.getByRole('button', { name: 'Load new values' }));

      await expect
        .poll(() =>
          page.getByPlaceholder(
            'nginx:latest or registry.example.com/my-app:v1.0.0',
          ),
        )
        .toHaveValue('redis:7-alpine');
    });

    test('links environment variable to auth client secret', async ({
      worker,
    }) => {
      vi.mocked(actions.updateApp).mockResolvedValue({ success: true });
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'auth-secret-app';
        app.spec.additionalResources = [
          {
            apiVersion: 'tesselar.io/v1',
            kind: 'AuthClient',
            metadata: { name: 'authclient' },
            spec: {
              redirectUris: ['https://example.com/callback'],
            },
          },
        ];
        app.spec.envVariables = [
          { name: 'OAUTH_CLIENT_SECRET', value: 'placeholder' },
        ];
        app.spec.ingress = { port: { name: 'http' } };
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(await page.getByText('auth-secret-app'));

      const linkButton = page.getByRole('button', { name: 'Link secret' });
      await user.click(linkButton);
      await user.click(
        page.getByRole('menuitem', {
          name: 'Client Secret authclient',
        }),
      );

      await user.click(page.getByText('Update'));

      await expect
        .poll(() => vi.mocked(actions.updateApp))
        .toHaveBeenCalledWith({
          name: 'auth-secret-app',
          image: 'postgres:16',
          ports: [{ name: 'http', containerPort: 80 }],
          envVariables: [
            {
              name: 'OAUTH_CLIENT_SECRET',
              valueFrom: {
                secretKeyRef: {
                  name: 'authclient',
                  key: 'client-secret',
                },
              },
            },
          ],
          resources: {
            limits: { cpu: '1000m', memory: '1Gi' },
          },
          ingress: { port: { name: 'http' } },
          additionalResources: [
            {
              apiVersion: 'tesselar.io/v1',
              kind: 'AuthClient',
              metadata: { name: 'authclient' },
              spec: {
                redirectUris: ['https://example.com/callback'],
                postLogoutRedirectUris: undefined,
              },
            },
          ],
          health: undefined,
          volumeMounts: [],
        });
    });

    test('links volume mount to persistent volume', async ({ worker }) => {
      vi.mocked(actions.updateApp).mockResolvedValue({ success: true });
      const user = userEvent.setup();
      const volumeResource = produce(basePersistentVolumeClaim, (draft) => {
        draft.metadata.name = 'data';
      });
      const app = produce(baseApp, (app) => {
        app.spec.name = 'pvc-mount-app';
        app.spec.additionalResources = [volumeResource];
        app.spec.volumeMounts = [];
        app.spec.ingress = { port: { name: 'http' } };
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(await page.getByText('pvc-mount-app'));

      await user.click(page.getByRole('button', { name: 'Add Volume Mount' }));

      const mountPathInput = page.getByPlaceholder('/data');
      await user.fill(mountPathInput, '/data');

      const volumeSelect = page.getByRole('combobox', {
        name: 'Persistent Volume',
      });
      await user.click(volumeSelect);
      await user.click(page.getByRole('option', { name: 'data' }));

      await user.click(page.getByText('Update'));

      await expect
        .poll(() => vi.mocked(actions.updateApp))
        .toHaveBeenCalledWith({
          ...app.spec,
          volumeMounts: [{ mountPath: '/data', name: 'data' }],
          additionalResources: [volumeResource],
          health: undefined,
        });
    });

    test('shows validation error when auth client link is removed', async ({
      worker,
    }) => {
      const user = userEvent.setup();
      const app = produce(baseApp, (app) => {
        app.spec.name = 'auth-client-removed-app';
        app.spec.additionalResources = [
          {
            apiVersion: 'tesselar.io/v1',
            kind: 'AuthClient',
            metadata: { name: 'authclient-main' },
            spec: {
              redirectUris: ['https://example.com/callback'],
            },
          },
        ];
        app.spec.envVariables = [
          {
            name: 'OAUTH_CLIENT_ID',
            valueFrom: {
              secretKeyRef: {
                name: 'authclient-main',
                key: 'client-id',
              },
            },
          },
        ];
        app.spec.ingress = { port: { name: 'http' } };
      });

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([app]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(await page.getByText('auth-client-removed-app'));

      await user.click(
        page.getByRole('button', { name: 'Remove Auth Client' }),
      );

      await user.click(page.getByText('Update'));

      await expect
        .poll(() =>
          page.getByText('Secret reference must match an existing resource'),
        )
        .toBeInTheDocument();
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
        page.getByRole('combobox', { name: 'Preset' }),
      ).toHaveTextContent('small');

      // Click on the resource limits select to open it
      await user.click(page.getByRole('combobox', { name: 'Preset' }));

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
          health: undefined,
          additionalResources: [],
          volumeMounts: [],
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
        page.getByRole('combobox', { name: 'Preset' }),
      ).toHaveTextContent('medium');

      await user.click(page.getByRole('combobox', { name: 'Preset' }));
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

      await user.click(page.getByRole('button', { name: 'Add Port' }));
      const newPortNameInput = page.getByLabelText('Port Name').nth(1);
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

      await user.click(page.getByRole('button', { name: 'Add Port' }));
      const newPortNameInput = page.getByLabelText('Port Name').nth(1);
      await user.fill(newPortNameInput, 'metrics');
      const newPortNumberInput = page.getByLabelText('Port Number').nth(1);
      await user.fill(newPortNumberInput, '80');

      await user.click(page.getByText('Update'));

      await expect
        .poll(() => page.getByText(/Port number must be unique/))
        .toBeInTheDocument();
    });
  });

  describe('create application', () => {
    test('captures default health check inputs on create', async ({
      worker,
    }) => {
      vi.mocked(actions.createApp).mockResolvedValue({ success: true });
      const user = userEvent.setup();

      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('Create App'));

      const healthSection = page.getByRole('group', { name: 'Health Check' });
      const pathInput = healthSection.getByLabelText('Path', { exact: true });
      const portSelect = healthSection.getByLabelText('Port', { exact: true });

      await expect.element(pathInput).toHaveValue('/');
      await expect.element(portSelect).toHaveTextContent('http');

      await user.fill(page.getByPlaceholder('App Name'), 'new-app');
      await user.fill(
        page.getByPlaceholder(
          'nginx:latest or registry.example.com/my-app:v1.0.0',
        ),
        'redis:7-alpine',
      );
      await user.click(page.getByText('Add Variable'));
      await user.fill(page.getByPlaceholder('VARIABLE_NAME'), 'REDIS_HOST');
      await user.fill(page.getByPlaceholder('value'), 'localhost');

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
          health: {
            check: {
              type: 'httpGet',
              path: '/',
              port: 'http',
            },
          },
          additionalResources: [],
          volumeMounts: [],
        });
    });

    test('fills form from dropped yaml file', async ({ worker }) => {
      const user = userEvent.setup();
      worker.use(
        http.get('*/api/trpc/apps', () => {
          return trpcJsonResponse([]);
        }),
      );

      await renderWithProviders(<Apps />);

      await user.click(page.getByText('Create App'));

      const nameInput = page.getByPlaceholder('App Name');
      await expect.element(nameInput).toHaveValue('');

      const appSpec = produce(baseApp.spec, (app) => {
        app.name = 'yaml-app';
        app.image = 'redis:7-alpine';
        app.ports = [{ name: 'http', containerPort: 8080 }];
        app.envVariables = [{ name: 'REDIS_HOST', value: 'localhost' }];
        app.resources = { limits: { cpu: '750m', memory: '768Mi' } };
        app.ingress = { port: { name: 'http' } };
        app.health = {
          check: {
            type: 'httpGet',
            path: '/health',
            port: 'http',
          },
        };
      });
      const yamlContent = YAML.stringify(appSpec);
      const dropArea = document.querySelector('[data-testid="app-drop-area"]');
      if (!dropArea) {
        throw new Error('Drop area not found');
      }

      const file = new File([yamlContent], 'app.yaml', { type: 'text/yaml' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const createDragEvent = (eventName: string) => {
        const event = new DragEvent(eventName, { bubbles: true });
        Object.defineProperty(event, 'dataTransfer', {
          value: dataTransfer,
        });
        return event;
      };

      ['dragenter', 'dragover', 'drop'].forEach((eventName) => {
        dropArea.dispatchEvent(createDragEvent(eventName));
      });

      await expect
        .poll(() => page.getByRole('button', { name: 'Use values' }))
        .toBeInTheDocument();
      await user.click(page.getByRole('button', { name: 'Use values' }));

      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const envNameInput = page.getByPlaceholder('VARIABLE_NAME');
      const envValueInput = page.getByPlaceholder('value');
      const portNameInput = page.getByLabelText('Port Name').nth(0);
      const portNumberInput = page.getByLabelText('Port Number').nth(0);
      const healthSection = page.getByRole('group', { name: 'Health Check' });
      const pathInput = healthSection.getByLabelText('Path', { exact: true });

      await expect.element(nameInput).toHaveValue('yaml-app');
      await expect.element(imageInput).toHaveValue('redis:7-alpine');
      await expect.element(envNameInput).toHaveValue('REDIS_HOST');
      await expect.element(envValueInput).toHaveValue('localhost');
      await expect.element(portNameInput).toHaveValue('http');
      await expect.element(portNumberInput).toHaveValue(8080);
      await expect.element(pathInput).toHaveValue('/health');
    });

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

      await expect
        .element(page.getByRole('button', { name: /Web Port/ }).nth(0))
        .toHaveAttribute('aria-pressed', 'true');

      const nameInput = page.getByPlaceholder('App Name');
      const imageInput = page.getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const envNameInput = page.getByPlaceholder('VARIABLE_NAME');
      const envValueInput = page.getByPlaceholder('value');

      await expect.element(nameInput).not.toHaveAttribute('readonly');

      await user.fill(nameInput, 'new-app');
      await user.fill(imageInput, 'redis:7-alpine');
      await user.click(page.getByText('Add Variable'));
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
          health: {
            check: {
              type: 'httpGet',
              path: '/',
              port: 'http',
            },
          },
          additionalResources: [],
          volumeMounts: [],
        });
    });
  });
});
