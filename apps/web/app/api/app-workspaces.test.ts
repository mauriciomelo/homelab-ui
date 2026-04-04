import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fs, vol } from 'memfs';
import { produce } from 'immer';
import { APP_STATUS } from '@/app/constants';
import path from 'path';
import { http, HttpResponse } from 'msw';
import YAML from 'yaml';
import { getAppConfig } from '../(dashboard)/apps/config';
import {
  createApp,
  discardDraft,
  getFile,
  getDraftsDir,
  getDraftDir,
  getApp,
  readAppBundleFromDirectory,
  getPersistedPublishedAppBundles,
  publishApp,
  listApps,
  listDrafts,
  openWith,
  updateApp,
  watchApp,
} from './app-workspaces';
import git, { PushResult } from 'isomorphic-git';
import {
  baseAppBundle,
  baseAppManifest,
  baseKustomization,
  baseNamespace,
  basePersistedAppManifest,
  basePersistentVolumeClaim,
} from '../../test-utils/fixtures';
import { server, setupMockGitRepo } from '../../test-utils';
import {
  appSchema,
  authClientSchema,
  kustomizationSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
  type AppBundleSchema,
  type AppSchema,
} from './schemas';
import z from 'zod';

type WatchEvent = { eventType: string; filename: string | null };
type WatchEventResolver = (
  value: IteratorResult<WatchEvent, undefined>,
) => void;

const gotkSyncPath =
  '/test-project/clusters/my-cluster/flux-system/gotk-sync.yaml';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(
    (
      _command: string,
      _args: string[],
      callback: (error: Error | null) => void,
    ) => {
      callback(null);
    },
  ),
}));

const { watchMock } = vi.hoisted(() => ({
  watchMock:
    vi.fn<
      (
        path: string,
        options: { recursive?: boolean },
      ) => AsyncIterableIterator<{ eventType: string; filename: string | null }>
    >(),
}));

vi.mock('server-only', () => ({}));

vi.mock('../(dashboard)/apps/config', () => ({
  getAppConfig: vi.fn(),
  getOptionalConfig: vi.fn(() => ({ PORT: 3000 })),
}));

vi.mock('fs', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return {
    default: memfs.fs,
    ...memfs.fs,
  };
});

vi.mock('node:fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return {
    default: memfs.fs.promises,
    ...memfs.fs.promises,
    watch: watchMock,
  };
});

vi.mock('child_process', () => ({
  default: {
    execFile: execFileMock,
  },
  execFile: execFileMock,
}));

vi.mock('./k8s', () => ({
  customObjectsApi: vi.fn().mockReturnValue({
    listClusterCustomObject: vi.fn(),
  }),
  appsApi: vi.fn().mockReturnValue({
    patchNamespacedDeployment: vi.fn(),
  }),
  coreApi: vi.fn().mockReturnValue({}),
}));

const mockGetAppConfig = vi.mocked(getAppConfig);
const gitPushMock = vi.spyOn(git, 'push').mockResolvedValue({
  ok: true,
  error: null,
  refs: {},
} satisfies PushResult);

function createBundle(
  app: AppSchema,
  additionalResources: AppBundleSchema['additionalResources'] = [],
): AppBundleSchema {
  return {
    app,
    additionalResources,
  };
}

beforeEach(() => {
  mockGetAppConfig.mockReturnValue({
    PROJECT_DIR: '/test-project',
    CLUSTER_NAME: 'my-cluster',
    USER_NAME: 'Test User',
    USER_EMAIL: 'test@example.com',
    GITHUB_TOKEN: 'test-token',
    PUBLISH_MDNS_SERVICE: true,
    PORT: 3000,
  });

  execFileMock.mockClear();
  watchMock.mockClear();
  vol.reset();
});

function seedFluxConfig() {
  vol.fromJSON({
    [gotkSyncPath]: YAML.stringify({
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'GitRepository',
      metadata: {
        name: 'flux-system',
        namespace: 'flux-system',
      },
      spec: {},
    }),
  });
}

function buildNamespace({ name }: { name: string }) {
  return produce(baseNamespace, (draft) => {
    draft.metadata.name = name;
    draft.metadata.labels = { name };
  });
}

describe('draft workspaces', () => {
  describe('persisted app operations', () => {
    beforeEach(async () => {
      await setupMockGitRepo({
        dir: '/test-project',
        fs,
      });

      seedFluxConfig();
    });

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

    it('creates a published app and persists canonical files', async () => {
      const appName = 'new-app';
      const createdBundle = createBundle(
        produce(baseAppManifest, (draft) => {
          draft.metadata.name = appName;
          draft.spec.image = 'nginx:latest';
          draft.spec.ports = [{ name: 'http', containerPort: 80 }];
          draft.spec.envVariables = [];
          draft.spec.resources = {
            limits: { cpu: '0.5', memory: '256Mi' },
          };
          draft.spec.ingress = { port: { name: 'http' } };
        }),
      );

      await createApp(createdBundle);

      const apps = await getPersistedPublishedAppBundles();
      const createdApp = apps.find((app) => app.app.metadata.name === appName);

      expect(createdApp?.app.spec.image).toBe('nginx:latest');

      const { data: persistedApp } = await getFile({
        path: `/test-project/clusters/my-cluster/my-applications/${appName}/app.yaml`,
        schema: appSchema,
      });
      const { data: persistedKustomization } = await getFile({
        path: `/test-project/clusters/my-cluster/my-applications/${appName}/kustomization.yaml`,
        schema: kustomizationSchema,
      });

      expect(persistedApp).toMatchObject(createdBundle.app);
      expect(persistedKustomization.resources).toContain('app.yaml');
    });

    it('creates namespace and additional resource files for published apps', async () => {
      const appName = 'resource-app';
      const authClient = {
        apiVersion: 'tesselar.io/v1',
        kind: 'AuthClient',
        metadata: { name: 'myauthclient' },
        spec: {
          redirectUris: ['https://auth-app.local/callback'],
          postLogoutRedirectUris: ['https://auth-app.local/logout'],
        },
      } satisfies z.infer<typeof authClientSchema>;
      const pvc = produce(basePersistentVolumeClaim, (draft) => {
        draft.metadata.name = 'app-data';
        draft.spec.resources.requests.storage = '10Gi';
      }) satisfies z.infer<typeof persistentVolumeClaimSchema>;

      const app = produce(baseAppManifest, (draft) => {
        draft.metadata.name = appName;
        draft.spec.ports = [{ name: 'http', containerPort: 8080 }];
        draft.spec.envVariables = [];
        draft.spec.ingress = { port: { name: 'http' } };
        draft.spec.volumeMounts = [{ mountPath: '/data', name: 'app-data' }];
      });

      await createApp(createBundle(app, [authClient, pvc]));

      const { data: namespace } = await getFile({
        path: `/test-project/clusters/my-cluster/my-applications/${appName}/namespace.yaml`,
        schema: namespaceSchema,
      });
      const { data: persistedAuthClient } = await getFile({
        path: `/test-project/clusters/my-cluster/my-applications/${appName}/myauthclient.authclient.yaml`,
        schema: authClientSchema,
      });
      const { data: persistedPersistentVolumeClaim } = await getFile({
        path: `/test-project/clusters/my-cluster/my-applications/${appName}/app-data.persistentvolumeclaim.yaml`,
        schema: persistentVolumeClaimSchema,
      });

      expect(namespace).toEqual(buildNamespace({ name: appName }));
      expect(persistedAuthClient).toEqual(authClient);
      expect(persistedPersistentVolumeClaim).toEqual(pvc);

      const createdApp = (await getPersistedPublishedAppBundles()).find(
        (item) => item.app.metadata.name === appName,
      );

      expect(createdApp?.additionalResources).toEqual([authClient, pvc]);
      expect(createdApp?.app.spec.volumeMounts).toEqual(app.spec.volumeMounts);
    });

    it('round-trips a published app spec through the workspace files', async () => {
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

      const apps = await getPersistedPublishedAppBundles();
      const createdApp = apps.find(
        (app) => app.app.metadata.name === expectedSpec.metadata.name,
      );

      expect(createdApp).toBeDefined();
      expect(createdApp?.app).toMatchObject(expectedSpec);
    });

    it('retrieves persisted published app bundles from the file system', async () => {
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

      vol.fromJSON(
        {
          './app1/kustomization.yaml': YAML.stringify({
            apiVersion: 'kustomize.config.k8s.io/v1beta1',
            kind: 'Kustomization',
            metadata: { name: 'app1' },
            namespace: 'app1',
            resources: ['app.yaml', 'namespace.yaml'],
          }),
          './app1/app.yaml': YAML.stringify(app1Manifest),
          './app1/namespace.yaml': YAML.stringify(
            buildNamespace({ name: 'app1' }),
          ),
        },
        '/test-project/clusters/my-cluster/my-applications/',
      );
      vol.fromJSON(
        {
          './app2/kustomization.yaml': YAML.stringify({
            apiVersion: 'kustomize.config.k8s.io/v1beta1',
            kind: 'Kustomization',
            metadata: { name: 'app2' },
            namespace: 'app2',
            resources: ['app.yaml', 'namespace.yaml'],
          }),
          './app2/app.yaml': YAML.stringify(app2Manifest),
          './app2/namespace.yaml': YAML.stringify(
            buildNamespace({ name: 'app2' }),
          ),
        },
        '/test-project/clusters/my-cluster/my-applications/',
      );

      const apps = await getPersistedPublishedAppBundles();

      expect(apps).toHaveLength(2);
      expect(apps[0]?.app.metadata.name).toBe('app1');
      expect(apps[0]?.app.spec.image).toBe('nginx:latest');
      expect(apps[1]?.app.metadata.name).toBe('app2');
      expect(apps[1]?.app.spec.image).toBe('redis:7');
    });

    it('rejects invalid published app bundles', async () => {
      const invalidHealthPortApp = produce(baseAppManifest, (draft) => {
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

      await expect(
        createApp(createBundle(invalidHealthPortApp)),
      ).rejects.toMatchObject({
        issues: [
          {
            path: ['app', 'spec', 'health', 'check', 'port'],
            message:
              'Health check port must reference a port in the defined ports list',
          },
        ],
      });

      const invalidVolumeMountApp = produce(baseAppManifest, (draft) => {
        draft.metadata.name = 'invalid-volume-app';
        draft.spec.envVariables = [];
        draft.spec.volumeMounts = [
          { mountPath: '/data', name: 'missing-claim' },
        ];
      });

      await expect(
        createApp(createBundle(invalidVolumeMountApp)),
      ).rejects.toMatchObject({
        issues: [
          {
            path: ['app', 'spec', 'volumeMounts', 0, 'name'],
            message: 'Volume mount must reference a persistent volume',
          },
        ],
      });
    });

    it('rejects bundles with missing required kustomization resources', async () => {
      const appName = 'missing-namespace-app';
      const appManifest = produce(basePersistedAppManifest, (draft) => {
        draft.metadata.name = appName;
      });

      vol.fromJSON(
        {
          './kustomization.yaml': YAML.stringify({
            ...baseKustomization,
            metadata: { name: appName },
            namespace: appName,
            resources: ['app.yaml'],
          }),
          './app.yaml': YAML.stringify(appManifest),
          './namespace.yaml': YAML.stringify(buildNamespace({ name: appName })),
        },
        `/test-project/clusters/my-cluster/my-applications/${appName}`,
      );

      await expect(
        readAppBundleFromDirectory(
          `/test-project/clusters/my-cluster/my-applications/${appName}`,
        ),
      ).rejects.toThrow(
        'kustomization.resources: Missing required resource "namespace.yaml"',
      );
    });

    it('rejects invalid bundle resource references when reading from disk', async () => {
      const appName = 'invalid-read-bundle-app';
      const appManifest = produce(basePersistedAppManifest, (draft) => {
        draft.metadata.name = appName;
        draft.spec.envVariables = [];
        draft.spec.volumeMounts = [
          { mountPath: '/data', name: 'missing-claim' },
        ];
      });

      vol.fromJSON(
        {
          './kustomization.yaml': YAML.stringify({
            ...baseKustomization,
            metadata: { name: appName },
            namespace: appName,
            resources: ['app.yaml', 'namespace.yaml'],
          }),
          './app.yaml': YAML.stringify(appManifest),
          './namespace.yaml': YAML.stringify(buildNamespace({ name: appName })),
        },
        `/test-project/clusters/my-cluster/my-applications/${appName}`,
      );

      await expect(
        readAppBundleFromDirectory(
          `/test-project/clusters/my-cluster/my-applications/${appName}`,
        ),
      ).rejects.toMatchObject({
        issues: [
          {
            path: ['app', 'spec', 'volumeMounts', 0, 'name'],
            message: 'Volume mount must reference a persistent volume',
          },
        ],
      });
    });

    it('publishes apps and cleans up draft directories', async () => {
      const publishedApp = produce(baseAppManifest, (draft) => {
        draft.metadata.name = 'publish-app';
      });

      await publishApp(createBundle(publishedApp));

      expect(gitPushMock).toHaveBeenCalled();

      const draftBundle = produce(createBundle(baseAppManifest), (draft) => {
        draft.draftId = 'draft-1';
        draft.app.metadata.name = 'published-draft';
      });

      await createApp(draftBundle);
      await publishApp(draftBundle);

      expect(fs.existsSync(path.join(getDraftsDir(), 'draft-1'))).toBe(false);
      expect(
        fs.existsSync(
          '/test-project/clusters/my-cluster/my-applications/published-draft/app.yaml',
        ),
      ).toBe(true);
    });
  });

  it('creates and reads a draft bundle', async () => {
    const createdDraft = produce(baseAppBundle, (draft) => {
      draft.draftId = 'draft-1';
      draft.app.metadata.name = 'draft-app';
      draft.app.spec.image = 'nginx:latest';
    });

    await createApp(createdDraft);

    expect(vol.existsSync(getDraftDir('draft-1'))).toBe(true);

    const loadedDraft = await getApp({ draftId: 'draft-1' });

    expect(loadedDraft.draftId).toBe('draft-1');
    expect(loadedDraft.app.metadata.name).toBe('draft-app');
    expect(loadedDraft.app.spec.image).toBe('nginx:latest');
  });

  it('updates a draft bundle on disk', async () => {
    const createdDraft = produce(baseAppBundle, (draft) => {
      draft.draftId = 'draft-1';
      draft.app.metadata.name = 'draft-app';
    });
    await createApp(createdDraft);

    const nextBundle = produce(baseAppBundle, (draft) => {
      draft.draftId = 'draft-1';
      draft.app.metadata.name = 'updated-draft';
      draft.app.spec.image = 'ghcr.io/example/app:1.2.3';
    });

    await createApp(nextBundle);

    const loadedDraft = await getApp({ draftId: 'draft-1' });

    expect(loadedDraft).toEqual(nextBundle);
  });

  it('discards a draft workspace', async () => {
    const createdDraft = produce(baseAppBundle, (draft) => {
      draft.draftId = 'draft-1';
      draft.app.metadata.name = 'draft-app';
    });
    await createApp(createdDraft);

    await discardDraft('draft-1');

    expect(vol.existsSync(getDraftDir('draft-1'))).toBe(false);
  });

  it('lists draft workspaces', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-1';
        draft.app.metadata.name = 'first-draft';
      }),
    );
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-2';
        draft.app.metadata.name = 'second-draft';
      }),
    );

    const drafts = await listDrafts();

    expect(drafts.map((draft) => draft.draftId)).toEqual(
      expect.arrayContaining(['draft-1', 'draft-2']),
    );
    expect(drafts.map((draft) => draft.app.metadata.name)).toContain(
      'second-draft',
    );
  });

  it('lists published apps by default', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        delete draft.draftId;
        draft.app.metadata.name = 'published-app';
      }),
    );
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-1';
        draft.app.metadata.name = 'draft-app';
      }),
    );

    const apps = await listApps();

    expect(apps.map((app) => app.app.metadata.name)).toEqual(['published-app']);
    expect(apps[0]?.status.phase).toBe(APP_STATUS.UNKNOWN);
  });

  it('merges live status into published apps', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        delete draft.draftId;
        draft.app.metadata.name = 'published-app';
      }),
    );

    server.use(
      http.post(
        'http://localhost:3000/api/control-plane/rpc/apps/getLiveApps',
        () => {
          return HttpResponse.json({
            json: [
              {
                ...produce(baseAppManifest, (draft) => {
                  draft.metadata.name = 'published-app';
                  draft.spec.ports = [{ name: 'http', containerPort: 80 }];
                  draft.spec.envVariables = [];
                }),
                status: {
                  phase: APP_STATUS.RUNNING,
                  placements: [{ nodeName: 'node-a' }],
                  conditions: [],
                },
              },
            ],
          });
        },
      ),
    );

    const apps = await listApps();

    expect(apps[0]?.status.phase).toBe(APP_STATUS.RUNNING);
    expect(apps[0]?.status.placements).toEqual([{ nodeName: 'node-a' }]);
  });

  it('includes drafts when requested', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        delete draft.draftId;
        draft.app.metadata.name = 'published-app';
      }),
    );
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-1';
        draft.app.metadata.name = 'draft-app';
      }),
    );

    const apps = await listApps({ includeDrafts: true });

    expect(apps.map((app) => app.app.metadata.name)).toEqual([
      'draft-app',
      'published-app',
    ]);
  });

  it('reads a committed app bundle for watchApp', async () => {
    const appBundle = produce(baseAppBundle, (draft) => {
      delete draft.draftId;
      draft.app.metadata.name = 'demo-app';
      draft.app.spec.image = 'nginx:stable';
    });

    await createApp(appBundle);

    await expect(
      getApp({
        appName: 'demo-app',
      }),
    ).resolves.toEqual({
      app: appBundle.app,
      additionalResources: appBundle.additionalResources,
    });
  });

  it('streams updated bundle snapshots for watched drafts', async () => {
    const queuedEvents: Array<IteratorResult<WatchEvent, undefined>> = [];
    let resolveNextEvent: WatchEventResolver | undefined;

    const iterator = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: vi.fn(() => {
        const queuedEvent = queuedEvents.shift();

        if (queuedEvent) {
          return Promise.resolve(queuedEvent);
        }

        return new Promise<IteratorResult<WatchEvent, undefined>>((resolve) => {
          resolveNextEvent = resolve;
        });
      }),
      return: vi.fn(async () => ({ done: true as const, value: undefined })),
    };

    watchMock.mockImplementation((path, options) => {
      expect(path).toBe('/test-project/clusters/my-cluster/my-applications');
      expect(options).toEqual({ recursive: true });
      return iterator;
    });

    const initialBundle = produce(baseAppBundle, (draft) => {
      draft.draftId = 'draft-1';
      draft.app.metadata.name = 'draft-app';
      draft.app.spec.image = 'nginx:latest';
    });
    const updatedBundle = produce(initialBundle, (draft) => {
      draft.app.spec.image = 'ghcr.io/example/app:2.0.0';
    });

    await createApp(initialBundle);

    const appWatcher = watchApp({ draftId: 'draft-1' });

    await expect(appWatcher.next()).resolves.toEqual({
      done: false,
      value: initialBundle,
    });

    const nextPromise = appWatcher.next();

    await createApp(updatedBundle);

    const nextEvent = {
      done: false as const,
      value: { eventType: 'change', filename: 'app.yaml' },
    };

    if (resolveNextEvent) {
      resolveNextEvent(nextEvent);
    } else {
      queuedEvents.push(nextEvent);
    }

    await expect(nextPromise).resolves.toEqual({
      done: false,
      value: updatedBundle,
    });

    await appWatcher.return(undefined);
  });
});

describe('openWith', () => {
  it('opens a draft workspace in Terminal', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-1';
      }),
    );

    await openWith({
      target: 'terminal',
      draftId: 'draft-1',
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'open',
      ['-a', 'Terminal', getDraftDir('draft-1')],
      expect.any(Function),
    );
  });

  it('opens a draft workspace in VSCode', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-1';
      }),
    );

    await openWith({
      target: 'vscode',
      draftId: 'draft-1',
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'code',
      [getDraftDir('draft-1')],
      expect.any(Function),
    );
  });

  it('opens a draft workspace in Cursor', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-1';
      }),
    );

    await openWith({
      target: 'cursor',
      draftId: 'draft-1',
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'open',
      ['-a', 'Cursor', getDraftDir('draft-1')],
      expect.any(Function),
    );
  });

  it('opens a committed app directory in Finder', async () => {
    vol.fromJSON({
      '/test-project/clusters/my-cluster/my-applications/demo-app/.keep': '',
    });

    await openWith({
      target: 'finder',
      appName: 'demo-app',
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'open',
      ['/test-project/clusters/my-cluster/my-applications/demo-app'],
      expect.any(Function),
    );
  });

  it('opens a committed app directory in Ghostty', async () => {
    vol.fromJSON({
      '/test-project/clusters/my-cluster/my-applications/demo-app/.keep': '',
    });

    await openWith({
      target: 'ghostty',
      appName: 'demo-app',
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'open',
      [
        '-n',
        '-a',
        'Ghostty',
        '/test-project/clusters/my-cluster/my-applications/demo-app',
      ],
      expect.any(Function),
    );
  });

  it('rejects requests without a single target identifier', async () => {
    await expect(
      openWith({
        target: 'finder',
      }),
    ).rejects.toThrow('Provide exactly one of appName or draftId');

    await expect(
      openWith({
        target: 'finder',
        appName: 'demo-app',
        draftId: 'draft-1234',
      }),
    ).rejects.toThrow('Provide exactly one of appName or draftId');
  });

  it('fails when the target path is missing', async () => {
    await expect(
      openWith({
        target: 'finder',
        appName: 'missing-app',
      }),
    ).rejects.toThrow();
  });

  it('surfaces command execution failures', async () => {
    await createApp(
      produce(baseAppBundle, (draft) => {
        draft.draftId = 'draft-1';
      }),
    );
    execFileMock.mockImplementationOnce(
      (
        _command: string,
        _args: string[],
        callback: (error: Error | null) => void,
      ) => {
        callback(new Error('VSCode is unavailable'));
      },
    );

    await expect(
      openWith({
        target: 'vscode',
        draftId: 'draft-1',
      }),
    ).rejects.toThrow('VSCode is unavailable');
  });

  it('fails on unsupported platforms', async () => {
    vol.fromJSON({
      '/test-project/clusters/my-cluster/my-applications/demo-app/.keep': '',
    });
    const platformSpy = vi
      .spyOn(process, 'platform', 'get')
      .mockReturnValue('linux');

    await expect(
      openWith({
        target: 'finder',
        appName: 'demo-app',
      }),
    ).rejects.toThrow('openWith currently supports only macOS');

    platformSpy.mockRestore();
  });
});
