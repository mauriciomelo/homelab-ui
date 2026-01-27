import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateApp, getApps, createApp, getFile } from './applications';
import { fs, vol } from 'memfs';

import YAML from 'yaml';
import { getAppConfig } from '../(dashboard)/apps/config';
import git, { PushResult } from 'isomorphic-git';
import {
  AppSchema,
  authClientSchema,
  deploymentSchema,
  IngressSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
  serviceSchema,
} from './schemas';
import { setupMockGitRepo } from '../../test-utils';
import {
  baseApp,
  baseDeployment,
  baseNamespace,
  basePersistentVolumeClaim,
  baseService,
} from '../../test-utils/fixtures';
import { produce } from 'immer';
import { APP_STATUS } from '@/app/constants';
import { ingressSchema } from './schemas';
import * as k from './k8s';
import z from 'zod';

const traefikConfigPath =
  '/test-project/clusters/my-cluster/tesselar-system/traefik/traefik-config.yaml';

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
      image: 'new-image:2.0',
      ports: [{ name: 'http', containerPort: 80 }],
      envVariables: [
        { name: 'API_KEY', value: 'secret-key' },
        { name: 'DEBUG', value: 'true' },
      ],
      resources: currentDeployment.spec.template.spec.containers[0].resources,
      ingress: { port: { name: 'http' } },
    } satisfies Partial<AppSchema>;

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

    seedTraefikConfig();
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
      ports: [{ name: 'http', containerPort: 80 }],
      envVariables: [],
      resources: {
        limits: { cpu, memory },
      },
      ingress: { port: { name: 'http' } },
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
      ports: [{ name: 'http', containerPort: customPort }],
      envVariables: [],
      resources: {
        limits: { cpu: '1', memory: '1Gi' },
      },
      ingress: { port: { name: 'http' } },
    });

    const { data: ingress } = await getFile({
      path: '/test-project/clusters/my-cluster/my-applications/custom-port-app/ingress.yaml',
      schema: ingressSchema,
    });

    expect(ingress.spec.rules[0].http.paths[0].backend.service.port.name).toBe(
      'http',
    );
  });

  it('creates service and namespace resources', async () => {
    const appName = 'required-resources-app';
    const port = 8080;

    const app = produce(baseApp.spec, (draft) => {
      draft.name = appName;
      draft.ports = [{ name: 'http', containerPort: port }];
      draft.envVariables = [];
      draft.ingress = { port: { name: 'http' } };
    });

    const expectedService = produce(baseService, (draft) => {
      draft.metadata.name = appName;
      draft.spec.selector.app = appName;
      draft.spec.ports[0].port = port;
      draft.spec.ports[0].name = 'http';
      draft.spec.ports[0].targetPort = 'http';
    });

    const expectedNamespace = produce(baseNamespace, (draft) => {
      draft.metadata.name = appName;
      draft.metadata.labels = { name: appName };
    });

    await createApp(app);

    const { data: service } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/service.yaml`,
      schema: serviceSchema,
    });

    const { data: namespace } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/namespace.yaml`,
      schema: namespaceSchema,
    });

    expect(service).toEqual(expectedService);
    expect(namespace).toEqual(expectedNamespace);
  });

  it('adds default health probes', async () => {
    const appName = 'health-probe-app';

    const app = produce(baseApp.spec, (draft) => {
      draft.name = appName;
      draft.ports = [{ name: 'http', containerPort: 8080 }];
      draft.ingress = { port: { name: 'http' } };
      draft.health = {
        check: {
          type: 'httpGet',
          path: '/',
          port: 'http',
        },
      };
    });

    await createApp(app);

    const { data: deployment } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/deployment.yaml`,
      schema: deploymentSchema,
    });

    const container = deployment.spec.template.spec.containers[0];

    expect(container.startupProbe).toEqual({
      httpGet: { path: '/', port: 'http' },
      initialDelaySeconds: 5,
      periodSeconds: 5,
      timeoutSeconds: 2,
      failureThreshold: 60,
    });

    expect(container.readinessProbe).toEqual({
      httpGet: { path: '/', port: 'http' },
      periodSeconds: 10,
      timeoutSeconds: 2,
      successThreshold: 1,
      failureThreshold: 3,
    });

    expect(container.livenessProbe).toEqual({
      httpGet: { path: '/', port: 'http' },
      periodSeconds: 10,
      timeoutSeconds: 2,
      successThreshold: 1,
      failureThreshold: 3,
    });
  });

  it('rejects health check ports outside defined ports', async () => {
    const app = produce(baseApp.spec, (draft) => {
      draft.name = 'invalid-health-port-app';
      draft.ports = [{ name: 'http', containerPort: 8080 }];
      draft.health = {
        check: {
          type: 'httpGet',
          path: '/',
          port: 'metrics',
        },
      };
    });

    await expect(createApp(app)).rejects.toMatchObject({
      issues: [
        {
          path: ['health', 'check', 'port'],
          message:
            'Health check port must reference a port in the defined ports list',
        },
      ],
    });
  });

  it('creates auth client resources', async () => {
    const expectedAuthClient = {
      apiVersion: 'tesselar.io/v1',
      kind: 'AuthClient',
      metadata: { name: 'myauthclient' },
      spec: {
        redirectUris: ['https://auth-app.local/callback'],
        postLogoutRedirectUris: ['https://auth-app.local/logout'],
      },
    } satisfies z.infer<typeof authClientSchema>;

    const appName = 'myapp';

    const app = produce(baseApp.spec, (draft) => {
      draft.name = appName;
      draft.additionalResources = [expectedAuthClient];
    });

    await createApp(app);

    const { data: persistedAuthClient } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/myauthclient.authclient.yaml`,
      schema: authClientSchema,
    });

    expect(persistedAuthClient).toEqual(expectedAuthClient);

    const apps = await getApps();
    const createdApp = apps.find((app) => app.spec.name === app.spec.name);

    expect(createdApp?.spec.additionalResources).toEqual([expectedAuthClient]);
  });

  it('creates persistent volume resources', async () => {
    const expectedPersistentVolumeClaim = produce(
      basePersistentVolumeClaim,
      (draft) => {
        draft.metadata.name = 'app-data';
        draft.spec.resources.requests.storage = '10Gi';
      },
    ) satisfies z.infer<typeof persistentVolumeClaimSchema>;

    const appName = 'storage-app';

    const app = produce(baseApp.spec, (draft) => {
      draft.name = appName;
      draft.additionalResources = [expectedPersistentVolumeClaim];
    });

    await createApp(app);

    const { data: persistedPersistentVolumeClaim } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/app-data.persistentvolumeclaim.yaml`,
      schema: persistentVolumeClaimSchema,
    });

    expect(persistedPersistentVolumeClaim).toEqual(
      expectedPersistentVolumeClaim,
    );

    const apps = await getApps();
    const createdApp = apps.find((app) => app.spec.name === appName);

    expect(createdApp?.spec.additionalResources).toEqual([
      expectedPersistentVolumeClaim,
    ]);
  });

  it('links volume mounts to persistent volumes', async () => {
    const expectedPersistentVolumeClaim = produce(
      basePersistentVolumeClaim,
      (draft) => {
        draft.metadata.name = 'app-data';
        draft.spec.resources.requests.storage = '10Gi';
      },
    ) satisfies z.infer<typeof persistentVolumeClaimSchema>;

    const appName = 'volume-app';

    const app = produce(baseApp.spec, (draft) => {
      draft.name = appName;
      draft.additionalResources = [expectedPersistentVolumeClaim];
      draft.envVariables = [];
      draft.volumeMounts = [
        {
          mountPath: '/data',
          name: expectedPersistentVolumeClaim.metadata.name,
        },
      ];
    });

    await createApp(app);

    const apps = await getApps();
    const createdApp = apps.find((app) => app.spec.name === appName);

    expect(createdApp?.spec.volumeMounts).toEqual(app.volumeMounts);
  });

  it('rejects volume mounts without matching persistent volumes', async () => {
    const app = produce(baseApp.spec, (draft) => {
      draft.name = 'invalid-volume-app';
      draft.additionalResources = [];
      draft.envVariables = [];
      draft.volumeMounts = [{ mountPath: '/data', name: 'missing-claim' }];
    });

    await expect(createApp(app)).rejects.toMatchObject({
      issues: [
        {
          path: ['volumeMounts', 0, 'name'],
          message: 'Volume mount must reference a persistent volume',
        },
      ],
    });
  });
});

describe('getApps', () => {
  beforeEach(async () => {
    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });

    seedTraefikConfig();
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
        './app1/service.yaml': YAML.stringify(buildService({ name: 'app1' })),
        './app1/namespace.yaml': YAML.stringify(
          buildNamespace({ name: 'app1' }),
        ),
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
        './app2/service.yaml': YAML.stringify(buildService({ name: 'app2' })),
        './app2/namespace.yaml': YAML.stringify(
          buildNamespace({ name: 'app2' }),
        ),
        './app2/deployment.yaml': YAML.stringify(app2Deployment),
      },
      baseAppsDir,
    );

    const apps = await getApps();

    expect(apps).toHaveLength(2);
    expect(apps[0].spec.name).toBe('app1');
    expect(apps[0].spec.image).toBe('nginx:latest');
    expect(apps[0].status).toBe(APP_STATUS.RUNNING);
    expect(apps[0].link).toBe('https://app1.local');

    expect(apps[1].spec.name).toBe('app2');
    expect(apps[1].spec.image).toBe('redis:7');
    expect(apps[1].status).toBe(APP_STATUS.RUNNING);
    expect(apps[1].link).toBe('https://app2.local');
  });

  it('correctly transforms the spec to files and back ', async () => {
    const expectedSpec = produce(baseApp.spec, (draft) => {
      draft.name = 'homeassistant';
      draft.image = 'homeassistant/home-assistant:stable';
      draft.ports = [{ name: 'http', containerPort: 8081 }];
      draft.envVariables = [];
      draft.resources = {
        limits: { cpu: '100m', memory: '256Mi' },
      };
      draft.ingress = { port: { name: 'http' } };
      draft.additionalResources = [];
    }) satisfies AppSchema;

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
    resources: [
      'namespace.yaml',
      'deployment.yaml',
      'service.yaml',
      'ingress.yaml',
    ],
  };
}

function buildIngress({ name }: { name: string }): IngressSchema {
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
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: name, port: { name: 'http' } },
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function buildService({ name }: { name: string }) {
  return produce(baseService, (draft) => {
    draft.metadata.name = name;
    draft.spec.selector.app = name;
    draft.spec.ports[0].name = 'http';
    draft.spec.ports[0].targetPort = 'http';
  });
}

function buildNamespace({ name }: { name: string }) {
  return produce(baseNamespace, (draft) => {
    draft.metadata.name = name;
    draft.metadata.labels = { name };
  });
}

function seedTraefikConfig() {
  const traefikConfig = {
    apiVersion: 'helm.cattle.io/v1',
    kind: 'HelmChartConfig',
    metadata: {
      name: 'traefik',
      namespace: 'kube-system',
    },
    spec: {
      valuesContent: YAML.stringify({
        providers: {
          kubernetesIngress: {
            defaultRule: 'Host(`{{ .Name }}.local`)',
          },
        },
      }),
    },
  };

  vol.fromJSON({
    [traefikConfigPath]: YAML.stringify(traefikConfig),
  });
}
