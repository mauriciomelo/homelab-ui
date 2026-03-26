import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  updateApp,
  getApps,
  createApp,
  getFile,
  publishApp,
} from './applications';
import { fs, vol } from 'memfs';

import YAML from 'yaml';
import { getAppConfig } from '../(dashboard)/apps/config';
import git, { PushResult } from 'isomorphic-git';
import {
  AppBundleSchema,
  AppSchema,
  appSchema,
  authClientSchema,
  kustomizationSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
} from './schemas';
import { setupMockGitRepo } from '../../test-utils';
import {
  baseAppManifest,
  baseKustomization,
  baseNamespace,
  basePersistedAppManifest,
  basePersistentVolumeClaim,
} from '../../test-utils/fixtures';
import { produce } from 'immer';
import { APP_STATUS } from '@/app/constants';
import * as k from './k8s';
import z from 'zod';

const gotkSyncPath =
  '/test-project/clusters/my-cluster/flux-system/gotk-sync.yaml';

function createBundle(
  app: AppSchema,
  additionalResources: AppBundleSchema['additionalResources'] = [],
): AppBundleSchema {
  return {
    app,
    additionalResources,
  };
}

vi.mock('server-only', () => ({}));

vi.mock('./k8s', () => ({
  customObjectsApi: vi.fn().mockReturnValue({
    getNamespacedCustomObjectStatus: vi.fn(),
  }),
  appsApi: vi.fn().mockReturnValue({
    patchNamespacedDeployment: vi.fn(),
  }),
  coreApi: vi.fn().mockReturnValue({}),
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

const mockGetNamespacedCustomObjectStatus = vi.fn().mockResolvedValue({
  status: {
    phase: APP_STATUS.RUNNING,
    placements: [],
    conditions: [],
  },
});

vi.mocked(k.appsApi).mockReturnValue(
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  {
    patchNamespacedDeployment: vi.fn(),
  } as unknown as ReturnType<typeof k.appsApi>,
);

vi.mocked(k.customObjectsApi).mockReturnValue(
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  {
    getNamespacedCustomObjectStatus: mockGetNamespacedCustomObjectStatus,
  } as unknown as ReturnType<typeof k.customObjectsApi>,
);

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
  it('keeps all kustomization resources after update', async () => {
    const appName = 'test-app';

    const namespace = produce(baseNamespace, (draft) => {
      draft.metadata.name = appName;
      draft.metadata.labels = {
        ...(draft.metadata.labels ?? {}),
        name: appName,
      };
    });

    const pvc = produce(basePersistentVolumeClaim, (draft) => {
      draft.metadata.name = 'data';
    });

    const kustomization = produce(baseKustomization, (draft) => {
      draft.metadata.name = appName;
      draft.namespace = appName;
      draft.resources = [
        'app.yaml',
        'namespace.yaml',
        'data.persistentvolumeclaim.yaml',
      ];
    });

    vol.fromJSON({
      '/test-project/clusters/my-cluster/my-applications/test-app/app.yaml':
        YAML.stringify(
          produce(basePersistedAppManifest, (draft) => {
            draft.metadata.name = appName;
          }),
        ),
      '/test-project/clusters/my-cluster/my-applications/test-app/namespace.yaml':
        YAML.stringify(namespace),
      '/test-project/clusters/my-cluster/my-applications/test-app/data.persistentvolumeclaim.yaml':
        YAML.stringify(pvc),
      '/test-project/clusters/my-cluster/my-applications/test-app/kustomization.yaml':
        YAML.stringify(kustomization),
    });

    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });

    const newSpec = produce(baseAppManifest, (draft) => {
      draft.metadata.name = appName;
      draft.spec.image = 'new-image:2.0';
      draft.spec.ports = [{ name: 'http', containerPort: 80 }];
      draft.spec.envVariables = [];
      draft.spec.ingress = { port: { name: 'http' } };
    });

    await updateApp(createBundle(newSpec, [pvc]));

    const { data: updatedKustomization } = await getFile({
      path: '/test-project/clusters/my-cluster/my-applications/test-app/kustomization.yaml',
      schema: kustomizationSchema,
    });

    expect([...updatedKustomization.resources].sort()).toEqual(
      [...kustomization.resources].sort(),
    );
    expect(
      fs.existsSync(
        '/test-project/clusters/my-cluster/my-applications/test-app/deployment.yaml',
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        '/test-project/clusters/my-cluster/my-applications/test-app/service.yaml',
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        '/test-project/clusters/my-cluster/my-applications/test-app/ingress.yaml',
      ),
    ).toBe(false);

    expect(gitPushMock).not.toHaveBeenCalled();
  });
});

describe('createApp', () => {
  beforeEach(async () => {
    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });

    seedFluxConfig();
  });

  it('creates a new application', async () => {
    const appName = 'new-app';
    const image = 'nginx:latest';
    const cpu = '0.5';
    const memory = '256Mi';

    await createApp(
      createBundle({
        apiVersion: 'tesselar.io/v1alpha1',
        kind: 'App',
        metadata: {
          name: appName,
        },
        spec: {
          image,
          ports: [{ name: 'http', containerPort: 80 }],
          envVariables: [],
          resources: {
            limits: { cpu, memory },
          },
          ingress: { port: { name: 'http' } },
        },
      }),
    );

    const apps = await getApps();
    const createdApp = apps.find((app) => app.app.metadata.name === appName);
    expect(createdApp).toBeDefined();
    expect(createdApp?.app.spec.image).toBe(image);
    expect(createdApp?.status.phase).toBe(APP_STATUS.RUNNING);
  });

  it('persists app.yaml as the canonical app manifest', async () => {
    const appName = 'persisted-app';

    await createApp(
      createBundle(
        produce(baseAppManifest, (draft) => {
          draft.metadata.name = appName;
        }),
      ),
    );

    const { data: persistedApp } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/app.yaml`,
      schema: appSchema,
    });

    expect(persistedApp).toMatchObject({
      ...baseAppManifest,
      metadata: { name: appName },
    });

    const { data: persistedKustomization } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/kustomization.yaml`,
      schema: kustomizationSchema,
    });

    expect(persistedKustomization.resources).toContain('app.yaml');
  });

  it('creates namespace and bundle resources only', async () => {
    const appName = 'required-resources-app';

    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = appName;
      draft.spec.ports = [{ name: 'http', containerPort: 8080 }];
      draft.spec.envVariables = [];
      draft.spec.ingress = { port: { name: 'http' } };
    });

    const expectedNamespace = produce(baseNamespace, (draft) => {
      draft.metadata.name = appName;
      draft.metadata.labels = { name: appName };
    });

    await createApp(createBundle(app));

    const { data: namespace } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/namespace.yaml`,
      schema: namespaceSchema,
    });

    const appDir = `/test-project/clusters/my-cluster/my-applications/${appName}`;

    expect(namespace).toEqual(expectedNamespace);
    expect(fs.existsSync(`${appDir}/deployment.yaml`)).toBe(false);
    expect(fs.existsSync(`${appDir}/service.yaml`)).toBe(false);
    expect(fs.existsSync(`${appDir}/ingress.yaml`)).toBe(false);
  });

  it('rejects health check ports outside defined ports', async () => {
    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = 'invalid-health-port-app';
      draft.spec.ports = [{ name: 'http', containerPort: 8080 }];
      draft.spec.health = {
        check: {
          type: 'httpGet',
          path: '/',
          port: 'metrics',
        },
      };
    });

    await expect(createApp(createBundle(app))).rejects.toMatchObject({
      issues: [
        {
          path: ['app', 'spec', 'health', 'check', 'port'],
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

    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = appName;
    });

    await createApp(createBundle(app, [expectedAuthClient]));

    const { data: persistedAuthClient } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/myauthclient.authclient.yaml`,
      schema: authClientSchema,
    });

    expect(persistedAuthClient).toEqual(expectedAuthClient);

    const apps = await getApps();
    const createdApp = apps.find(
      (resource) => resource.app.metadata.name === app.metadata.name,
    );

    expect(createdApp?.additionalResources).toEqual([expectedAuthClient]);
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

    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = appName;
    });

    await createApp(createBundle(app, [expectedPersistentVolumeClaim]));

    const { data: persistedPersistentVolumeClaim } = await getFile({
      path: `/test-project/clusters/my-cluster/my-applications/${appName}/app-data.persistentvolumeclaim.yaml`,
      schema: persistentVolumeClaimSchema,
    });

    expect(persistedPersistentVolumeClaim).toEqual(
      expectedPersistentVolumeClaim,
    );

    const apps = await getApps();
    const createdApp = apps.find((app) => app.app.metadata.name === appName);

    expect(createdApp?.additionalResources).toEqual([
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

    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = appName;
      draft.spec.envVariables = [];
      draft.spec.volumeMounts = [
        {
          mountPath: '/data',
          name: expectedPersistentVolumeClaim.metadata.name,
        },
      ];
    });

    await createApp(createBundle(app, [expectedPersistentVolumeClaim]));

    const apps = await getApps();
    const createdApp = apps.find((app) => app.app.metadata.name === appName);

    expect(createdApp?.app.spec.volumeMounts).toEqual(app.spec.volumeMounts);
  });

  it('rejects volume mounts without matching persistent volumes', async () => {
    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = 'invalid-volume-app';
      draft.spec.envVariables = [];
      draft.spec.volumeMounts = [{ mountPath: '/data', name: 'missing-claim' }];
    });

    await expect(createApp(createBundle(app))).rejects.toMatchObject({
      issues: [
        {
          path: ['app', 'spec', 'volumeMounts', 0, 'name'],
          message: 'Volume mount must reference a persistent volume',
        },
      ],
    });
  });
});

describe('publishApp', () => {
  beforeEach(async () => {
    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });

    seedFluxConfig();
  });

  it('commits and pushes published app changes', async () => {
    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = 'publish-app';
    });

    await publishApp(createBundle(app));

    expect(gitPushMock).toHaveBeenCalled();
  });

  it('removes the draft directory after publishing a draft', async () => {
    const draftBundle = produce(createBundle(baseAppManifest), (draft) => {
      draft.draftId = 'draft-1';
      draft.app.metadata.name = 'published-draft';
    });

    await createApp(draftBundle);
    await publishApp(draftBundle);

    expect(
      fs.existsSync('/test-project/clusters/my-cluster/my-applications/.drafts/draft-1'),
    ).toBe(false);
    expect(
      fs.existsSync('/test-project/clusters/my-cluster/my-applications/published-draft/app.yaml'),
    ).toBe(true);
  });
});

describe('getApps', () => {
  beforeEach(async () => {
    await setupMockGitRepo({
      dir: '/test-project',
      fs,
    });

    seedFluxConfig();
  });
  it('retrieves all applications from file system', async () => {
    const app1Manifest = produce(basePersistedAppManifest, (draft) => {
      draft.metadata.name = 'app1';
      draft.spec.image = 'nginx:latest';
      draft.spec.envVariables = [{ name: 'ENV_VAR', value: 'production' }];
    });

    const app2Manifest = produce(basePersistedAppManifest, (draft) => {
      draft.metadata.name = 'app2';
      draft.spec.image = 'redis:7';
      draft.spec.envVariables = [];
    });

    const baseAppsDir = '/test-project/clusters/my-cluster/my-applications/';
    vol.fromJSON(
      {
        './app1/kustomization.yaml': YAML.stringify(
          buildKustomization({ name: 'app1' }),
        ),
        './app1/app.yaml': YAML.stringify(app1Manifest),
        './app1/namespace.yaml': YAML.stringify(
          buildNamespace({ name: 'app1' }),
        ),
      },
      baseAppsDir,
    );

    vol.fromJSON(
      {
        './app2/kustomization.yaml': YAML.stringify(
          buildKustomization({ name: 'app2' }),
        ),
        './app2/app.yaml': YAML.stringify(app2Manifest),
        './app2/namespace.yaml': YAML.stringify(
          buildNamespace({ name: 'app2' }),
        ),
      },
      baseAppsDir,
    );

    const apps = await getApps();

    expect(apps).toHaveLength(2);
    expect(apps[0].app.metadata.name).toBe('app1');
    expect(apps[0].app.spec.image).toBe('nginx:latest');
    expect(apps[0].status.phase).toBe(APP_STATUS.RUNNING);

    expect(apps[1].app.metadata.name).toBe('app2');
    expect(apps[1].app.spec.image).toBe('redis:7');
    expect(apps[1].status.phase).toBe(APP_STATUS.RUNNING);
  });

  it('correctly transforms the spec to files and back ', async () => {
    const expectedSpec = produce(baseAppManifest, (draft) => {
      draft.metadata.name = 'homeassistant';
      draft.spec.image = 'homeassistant/home-assistant:stable';
      draft.spec.ports = [{ name: 'http', containerPort: 8081 }];
      draft.spec.envVariables = [];
      draft.spec.resources = {
        limits: { cpu: '100m', memory: '256Mi' },
      };
      draft.spec.ingress = { port: { name: 'http' } };
    }) satisfies AppSchema;

    await createApp(createBundle(expectedSpec));

    const apps = await getApps();
    const createdApp = apps.find(
      (app) => app.app.metadata.name === expectedSpec.metadata.name,
    );
    expect(createdApp).toBeDefined();
    expect(createdApp?.app).toMatchObject(expectedSpec);
  });

  it('reports pending status before the controller creates a deployment', async () => {
    mockGetNamespacedCustomObjectStatus.mockRejectedValueOnce({ code: 404 });

    const appName = 'pending-app';
    vol.fromJSON(
      {
        './pending-app/kustomization.yaml': YAML.stringify(
          buildKustomization({ name: appName }),
        ),
        './pending-app/app.yaml': YAML.stringify(
          produce(basePersistedAppManifest, (draft) => {
            draft.metadata.name = appName;
          }),
        ),
        './pending-app/namespace.yaml': YAML.stringify(
          buildNamespace({ name: appName }),
        ),
      },
      '/test-project/clusters/my-cluster/my-applications/',
    );

    const apps = await getApps();
    const app = apps.find((resource) => resource.app.metadata.name === appName);

    expect(app?.status.phase).toBe(APP_STATUS.PENDING);
    expect(app?.status.placements).toEqual([]);
  });
});

function buildKustomization({ name }: { name: string }) {
  return {
    apiVersion: 'kustomize.config.k8s.io/v1beta1',
    kind: 'Kustomization',
    metadata: { name: name },
    namespace: name,
    resources: [
      'app.yaml',
      'namespace.yaml',
    ],
  };
}

function buildNamespace({ name }: { name: string }) {
  return produce(baseNamespace, (draft) => {
    draft.metadata.name = name;
    draft.metadata.labels = { name };
  });
}

function seedFluxConfig() {
  const gitRepository = {
    apiVersion: 'source.toolkit.fluxcd.io/v1',
    kind: 'GitRepository',
    metadata: {
      name: 'flux-system',
      namespace: 'flux-system',
    },
    spec: {
      interval: '30000m0s',
      ref: {
        branch: 'main',
      },
      secretRef: {
        name: 'flux-system',
      },
      url: 'ssh://git@github.com/example/repo',
    },
  };

  const kustomization = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: 'flux-system',
      namespace: 'flux-system',
    },
    spec: {
      interval: '10m0s',
      path: './clusters/my-cluster',
      prune: true,
      postBuild: {
        substitute: {
          DOMAIN: 'local',
        },
      },
      sourceRef: {
        kind: 'GitRepository',
        name: 'flux-system',
      },
    },
  };

  const gotkSyncContent = [
    YAML.stringify(gitRepository),
    YAML.stringify(kustomization),
  ].join('---\n');

  vol.fromJSON({
    [gotkSyncPath]: gotkSyncContent,
  });
}
