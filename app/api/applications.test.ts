import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateApp, getApps, createApp, getFile } from './applications';
import { fs, vol } from 'memfs';

import YAML from 'yaml';
import { getAppConfig } from '../(dashboard)/apps/config';
import git, { PushResult } from 'isomorphic-git';
import { AppFormSchema } from '../(dashboard)/apps/formSchema';
import { setupMockGitRepo } from '../../test-utils';
import { baseDeployment } from '../../test-utils/fixtures';
import { produce } from 'immer';
import { APP_STATUS, ingressSchema } from './schemas';
import * as k from './k8s';

vi.mock('server-only', () => ({}));

vi.mock('./k8s', () => ({
  customObjectsApi: vi.fn().mockReturnValue({
    patchNamespacedCustomObject: vi.fn(),
  }),
  appsApi: vi.fn().mockReturnValue({
    readNamespacedDeployment: vi.fn(),
    patchNamespacedDeployment: vi.fn(),
  }),
  coreApi: vi.fn().mockReturnValue({
    listNamespacedPod: vi.fn(),
  }),
}));

vi.mock('../(dashboard)/apps/config', () => ({
  getAppConfig: vi.fn(),
}));

vi.mock('fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return { default: memfs.fs, ...memfs.fs };
});

vi.mock('node:fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs.promises;
});

const gitPushMock = vi.spyOn(git, 'push').mockResolvedValue({
  ok: true,
  error: null,
  refs: {},
} satisfies PushResult);

const mockGetAppConfig = vi.mocked(getAppConfig);

const mockReadNamespacedDeployment = vi.fn().mockResolvedValue({
  spec: { replicas: 1 },
  status: {
    replicas: 1,
    updatedReplicas: 1,
    availableReplicas: 1,
    readyReplicas: 1,
  },
});
const mockListNamespacedPod = vi.fn().mockResolvedValue({
  items: [],
});

vi.mocked(k.appsApi).mockReturnValue({
  readNamespacedDeployment: mockReadNamespacedDeployment,
  patchNamespacedDeployment: vi.fn(),
} as unknown as ReturnType<typeof k.appsApi>);

vi.mocked(k.coreApi).mockReturnValue({
  listNamespacedPod: mockListNamespacedPod,
} as unknown as ReturnType<typeof k.coreApi>);

beforeEach(async () => {
  mockGetAppConfig.mockReturnValue({
    PROJECT_DIR: '/test-project',
    CLUSTER_NAME: 'my-cluster',
    USER_NAME: 'Test User',
    USER_EMAIL: 'test@example.com',
    GITHUB_TOKEN: 'test-token',
    PUBLISH_MDNS_SERVICE: true,
    PORT: 3000,
  });

  vi.clearAllMocks();
  vol.reset();
});

describe('updateApp', () => {
  it('updates the deployment file with new configuration', async () => {
    const appName = 'test-app';

    const currentDeployment = produce(baseDeployment, (draft) => {
      draft.metadata.name = appName;
      draft.spec.template.spec.containers[0].image = 'old-image:1.0';

      // Starts with no env variables
      draft.spec.template.spec.containers[0].env = [];
    });

    vol.fromJSON({
      '/test-project/clusters/my-cluster/my-applications/test-app/deployment.yaml':
        YAML.stringify(currentDeployment),
    });

    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });

    const newSpec = {
      name: appName,
      image: 'new-image:2.0', // Updated image
      // Add some env variables
      envVariables: [
        { name: 'API_KEY', value: 'secret-key' },
        { name: 'DEBUG', value: 'true' },
      ],
      resources: currentDeployment.spec.template.spec.containers[0].resources,
      ingress: { port: { number: 80 } },
    } satisfies Partial<AppFormSchema>;

    await expect(updateApp(newSpec)).resolves.toEqual({
      success: true,
    });

    const updatedDeploymentPath =
      '/test-project/clusters/my-cluster/my-applications/test-app/deployment.yaml';
    const updatedDeploymentContent = fs
      .readFileSync(updatedDeploymentPath, 'utf-8')
      .toString();
    const updatedDeployment = YAML.parse(updatedDeploymentContent);

    expect(updatedDeployment.spec.template.spec.containers[0].image).toBe(
      'new-image:2.0',
    );

    expect(updatedDeployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'API_KEY', value: 'secret-key' },
      { name: 'DEBUG', value: 'true' },
    ]);

    expect(gitPushMock).toHaveBeenCalled();
  });
});

describe('createApp', () => {
  beforeEach(async () => {
    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });
  });

  it('creates a new application', async () => {
    const appName = 'new-app';
    const image = 'nginx:latest';
    const cpu = '0.5';
    const memory = '256Mi';
    const replicas = 1;

    await createApp({
      name: appName,
      image,
      envVariables: [],
      resources: {
        limits: { cpu, memory },
      },
      ingress: { port: { number: 80 } },
    });

    const apps = await getApps();
    const createdApp = apps.find((app) => app.spec.name === appName);
    expect(createdApp).toBeDefined();
    expect(createdApp?.spec.image).toBe(image);
    expect(createdApp?.deployment.spec.replicas).toBe(replicas);
  });

  it('creates ingress with custom port', async () => {
    const appName = 'custom-port-app';
    const customPort = 8080;

    await createApp({
      name: appName,
      image: 'my-app:latest',
      envVariables: [],
      resources: {
        limits: { cpu: '1', memory: '1Gi' },
      },
      ingress: { port: { number: customPort } },
    });

    const { data: ingress } = await getFile({
      path: '/test-project/clusters/my-cluster/my-applications/custom-port-app/ingress.yaml',
      schema: ingressSchema,
    });

    expect(
      ingress.spec.rules[0].http.paths[0].backend.service.port.number,
    ).toBe(customPort);
  });
});

describe('getApps', () => {
  beforeEach(async () => {
    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });
  });
  it('retrieves all applications from file system', async () => {
    const app1Deployment = produce(baseDeployment, (draft) => {
      draft.metadata.name = 'app1';
      draft.spec.template.spec.containers[0].image = 'nginx:latest';
      draft.spec.template.spec.containers[0].env = [
        { name: 'ENV_VAR', value: 'production' },
      ];
    });

    const app2Deployment = produce(baseDeployment, (draft) => {
      draft.metadata.name = 'app2';
      draft.spec.template.spec.containers[0].image = 'redis:7';
      draft.spec.template.spec.containers[0].env = [];
    });

    const baseAppsDir = '/test-project/clusters/my-cluster/my-applications/';
    // Create app1 files
    vol.fromJSON(
      {
        './app1/kustomization.yaml': YAML.stringify(
          buildKustomization({ name: 'app1' }),
        ),
        './app1/ingress.yaml': YAML.stringify(buildIngress({ name: 'app1' })),
        './app1/deployment.yaml': YAML.stringify(app1Deployment),
      },
      baseAppsDir,
    );

    // Create app2 files
    vol.fromJSON(
      {
        './app2/kustomization.yaml': YAML.stringify(
          buildKustomization({ name: 'app2' }),
        ),
        './app2/ingress.yaml': YAML.stringify(buildIngress({ name: 'app2' })),
        './app2/deployment.yaml': YAML.stringify(app2Deployment),
      },
      baseAppsDir,
    );

    const apps = await getApps();

    expect(apps).toHaveLength(2);
    expect(apps[0].spec.name).toBe('app1');
    expect(apps[0].spec.image).toBe('nginx:latest');
    expect(apps[0].status).toBe(APP_STATUS.RUNNING);
    expect(apps[0].link).toBe('http://app1.local');

    expect(apps[1].spec.name).toBe('app2');
    expect(apps[1].spec.image).toBe('redis:7');
    expect(apps[1].status).toBe(APP_STATUS.RUNNING);
    expect(apps[1].link).toBe('http://app2.local');
  });

  it('correctly transforms the spec to files and back ', async () => {
    const expectedSpec = {
      name: 'homeassistant',
      image: 'homeassistant/home-assistant:stable',
      envVariables: [],
      resources: {
        limits: { cpu: '100m', memory: '256Mi' },
      },
      ingress: { port: { number: 8081 } },
    } satisfies AppFormSchema;

    await createApp(expectedSpec);

    const apps = await getApps();
    const createdApp = apps.find((app) => app.spec.name === expectedSpec.name);
    expect(createdApp).toBeDefined();
    expect(createdApp?.spec).toEqual(expectedSpec);
  });
});

function buildKustomization({ name }: { name: string }) {
  return {
    apiVersion: 'kustomize.config.k8s.io/v1beta1',
    kind: 'Kustomization',
    metadata: { name: name },
    namespace: name,
    resources: ['deployment.yaml', 'ingress.yaml'],
  };
}

function buildIngress({ name }: { name: string }) {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: name,
      annotations: {},
    },
    spec: {
      rules: [
        {
          host: `${name}.local`,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: name, port: { number: 80 } },
                },
              },
            ],
          },
        },
      ],
    },
  };
}
