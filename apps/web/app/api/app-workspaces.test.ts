import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KubeConfig,
  CustomObjectsApi,
  CoreV1Api,
} from '@kubernetes/client-node';
import { http, HttpResponse } from 'msw';
import { produce } from 'immer';
import { server } from '@/test-utils';
import {
  baseAppBundle,
  baseAppManifest,
  basePersistentVolumeClaim,
} from '@/test-utils/fixtures';
import { getApp, updateApp, createApp, listApps } from './app-workspaces';

vi.mock('./k8s', () => ({
  coreApi: () => {
    const config = new KubeConfig();
    config.loadFromClusterAndUser(
      { name: 'test', server: 'https://cluster.test', skipTLSVerify: false },
      { name: 'test' },
    );
    return config.makeApiClient(CoreV1Api);
  },
  customObjectsApi: () => {
    const config = new KubeConfig();
    config.loadFromClusterAndUser(
      { name: 'test', server: 'https://cluster.test', skipTLSVerify: false },
      { name: 'test' },
    );
    return config.makeApiClient(CustomObjectsApi);
  },
}));

const endpoint =
  'https://cluster.test/apis/tesselar.io/v1alpha1/namespaces/podinfo/apps/podinfo';
function storedApp() {
  const app = produce(baseAppManifest, (draft) => {
    draft.metadata.name = 'podinfo';
    draft.spec.image = 'podinfo:old';
  });
  return {
    ...app,
    metadata: {
      ...app.metadata,
      namespace: 'podinfo',
      resourceVersion: '7',
      uid: 'app-uid',
      labels: { keep: 'yes' },
    },
    status: { phase: 'Running', placements: [], conditions: [] },
  };
}
function submittedApp() {
  return produce(baseAppBundle, (draft) => {
    draft.app.metadata.name = 'podinfo';
    draft.app.spec.image = 'podinfo:new';
    draft.clusterResourceVersion = '7';
  });
}

function appWithResources() {
  return produce(submittedApp(), (draft) => {
    draft.additionalResources = [
      produce(basePersistentVolumeClaim, (volume) => {
        volume.spec.resources.requests.storage = '2Gi';
      }),
      {
        apiVersion: 'tesselar.io/v1',
        kind: 'AuthClient',
        metadata: { name: 'sso' },
        spec: { redirectUris: ['https://podinfo.example.com/callback'] },
      },
    ];
    draft.app.spec.volumeMounts = [{ name: 'data', mountPath: '/data' }];
    draft.app.spec.envVariables = [
      {
        name: 'CLIENT_ID',
        valueFrom: { secretKeyRef: { name: 'sso', key: 'client-id' } },
      },
    ];
  });
}
const volumeEndpoint =
  'https://cluster.test/api/v1/namespaces/podinfo/persistentvolumeclaims/data';
const authEndpoint =
  'https://cluster.test/apis/tesselar.io/v1/namespaces/podinfo/authclients/sso';
function respond(body: unknown) {
  return new HttpResponse(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('existing cluster app editing', () => {
  beforeEach(() => {
    server.use(
      http.get(
        'https://cluster.test/api/v1/namespaces/podinfo/persistentvolumeclaims',
        () => HttpResponse.json({ items: [] }),
      ),
      http.get(
        'https://cluster.test/apis/tesselar.io/v1/namespaces/podinfo/authclients',
        () => HttpResponse.json({ items: [] }),
      ),
    );
  });
  it('reads and updates the App spec while preserving metadata and status', async () => {
    const stored = storedApp();
    let written: unknown;
    server.use(
      http.get(endpoint, () => HttpResponse.json(stored)),
      http.put(endpoint, async ({ request }) => {
        written = await request.json();
        return new HttpResponse(JSON.stringify(written), {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const bundle = await getApp({ appName: 'podinfo' });
    expect(bundle.clusterResourceVersion).toBe('7');
    expect(bundle.app.spec.image).toBe('podinfo:old');
    const edited = produce(bundle, (draft) => {
      draft.app.spec.image = 'podinfo:new';
    });
    await expect(updateApp(edited)).resolves.toEqual({ success: true });
    expect(written).toEqual({ ...stored, spec: edited.app.spec });
  });

  it('rejects stale edits without writing', async () => {
    let writes = 0;
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({
          ...storedApp(),
          metadata: { ...storedApp().metadata, resourceVersion: '8' },
        }),
      ),
      http.put(endpoint, () => {
        writes += 1;
        return HttpResponse.json({});
      }),
    );
    await expect(updateApp(submittedApp())).rejects.toThrow(
      'changed in the cluster',
    );
    expect(writes).toBe(0);
  });

  it('surfaces Kubernetes write conflicts', async () => {
    server.use(
      http.get(endpoint, () => HttpResponse.json(storedApp())),
      http.put(endpoint, () =>
        HttpResponse.json(
          {
            kind: 'Status',
            message: 'Object changed',
            reason: 'Conflict',
            code: 409,
          },
          { status: 409 },
        ),
      ),
    );
    await expect(updateApp(submittedApp())).rejects.toThrow();
  });

  it('rejects broken resource references and missing read versions', async () => {
    const app = submittedApp();
    const withVolume = produce(app, (draft) => {
      draft.app.spec.volumeMounts = [{ name: 'data', mountPath: '/data' }];
    });
    await expect(updateApp(withVolume)).rejects.toThrow();
    const withoutVersion = produce(app, (draft) => {
      delete draft.clusterResourceVersion;
    });
    await expect(updateApp(withoutVersion)).rejects.toThrow('Reload');
  });

  it('surfaces missing apps instead of reading local files', async () => {
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ message: 'Not found', code: 404 }, { status: 404 }),
      ),
    );
    await expect(getApp({ appName: 'podinfo' })).rejects.toThrow();
  });
  it('lists apps from Kubernetes without a local repository', async () => {
    server.use(
      http.get('https://cluster.test/apis/tesselar.io/v1alpha1/apps', () =>
        HttpResponse.json({ items: [storedApp()] }),
      ),
      http.get(endpoint, () => HttpResponse.json(storedApp())),
    );
    const apps = await listApps();
    expect(apps).toHaveLength(1);
    expect(apps[0]?.app.metadata.name).toBe('podinfo');
    expect(apps[0]?.clusterResourceVersion).toBe('7');
  });

  it('creates a namespace before creating the App directly', async () => {
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ code: 404 }, { status: 404 }),
      ),
    );
    const writes: string[] = [];
    let created: unknown;
    server.use(
      http.get('https://cluster.test/api/v1/namespaces/podinfo', () =>
        HttpResponse.json({ code: 404 }, { status: 404 }),
      ),
      http.post('https://cluster.test/api/v1/namespaces', () => {
        writes.push('namespace');
        return HttpResponse.json({ metadata: { name: 'podinfo' } });
      }),
      http.post(
        'https://cluster.test/apis/tesselar.io/v1alpha1/namespaces/podinfo/apps',
        async ({ request }) => {
          writes.push('app');
          created = await request.json();
          return new HttpResponse(JSON.stringify(created), {
            headers: { 'Content-Type': 'application/json' },
          });
        },
      ),
    );
    const input = produce(submittedApp(), (draft) => {
      delete draft.clusterResourceVersion;
    });
    await expect(createApp(input)).resolves.toEqual({ success: true });
    expect(writes).toEqual(['namespace', 'app']);
    expect(created).toMatchObject({
      kind: 'App',
      metadata: { name: 'podinfo', namespace: 'podinfo' },
      spec: input.app.spec,
    });
  });

  it('rejects duplicate app creation instead of overwriting it', async () => {
    server.use(http.get(endpoint, () => HttpResponse.json(storedApp())));
    server.use(
      http.get('https://cluster.test/api/v1/namespaces/podinfo', () =>
        HttpResponse.json({ metadata: { name: 'podinfo' } }),
      ),
      http.post(
        'https://cluster.test/apis/tesselar.io/v1alpha1/namespaces/podinfo/apps',
        () =>
          HttpResponse.json(
            { code: 409, message: 'Already exists' },
            { status: 409 },
          ),
      ),
    );
    await expect(createApp(submittedApp())).rejects.toThrow();
  });
  it('creates PVCs and AuthClients before the App with valid references', async () => {
    const bundle = appWithResources();
    const writes: string[] = [];
    const bodies: unknown[] = [];
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ code: 404 }, { status: 404 }),
      ),
      http.get('https://cluster.test/api/v1/namespaces/podinfo', () =>
        HttpResponse.json({ metadata: { name: 'podinfo' } }),
      ),
      http.get(volumeEndpoint, () =>
        HttpResponse.json({ code: 404 }, { status: 404 }),
      ),
      http.get(authEndpoint, () =>
        HttpResponse.json({ code: 404 }, { status: 404 }),
      ),
      http.post(
        'https://cluster.test/api/v1/namespaces/podinfo/persistentvolumeclaims',
        async ({ request }) => {
          writes.push('volume');
          const body: unknown = await request.json();
          bodies.push(body);
          return respond(body);
        },
      ),
      http.post(
        'https://cluster.test/apis/tesselar.io/v1/namespaces/podinfo/authclients',
        async ({ request }) => {
          writes.push('auth');
          const body: unknown = await request.json();
          bodies.push(body);
          return respond(body);
        },
      ),
      http.post(
        'https://cluster.test/apis/tesselar.io/v1alpha1/namespaces/podinfo/apps',
        async ({ request }) => {
          writes.push('app');
          const body: unknown = await request.json();
          bodies.push(body);
          return respond(body);
        },
      ),
    );
    await expect(createApp(bundle)).resolves.toEqual({ success: true });
    expect(writes).toEqual(['volume', 'auth', 'app']);
    expect(bodies[0]).toMatchObject({
      kind: 'PersistentVolumeClaim',
      metadata: { name: 'data', namespace: 'podinfo' },
      spec: { resources: { requests: { storage: '2Gi' } } },
    });
    expect(bodies[1]).toMatchObject({
      kind: 'AuthClient',
      metadata: { name: 'sso', namespace: 'podinfo' },
      spec: { redirectUris: ['https://podinfo.example.com/callback'] },
    });
    expect(bodies[2]).toMatchObject({ spec: bundle.app.spec });
  });

  it('updates supporting resources while preserving PVC bindings and resource metadata', async () => {
    const bundle = appWithResources();
    const volume = produce(basePersistentVolumeClaim, (draft) => {
      draft.metadata.name = 'data';
    });
    const boundVolume = {
      ...volume,
      metadata: {
        ...volume.metadata,
        namespace: 'podinfo',
        resourceVersion: '3',
        uid: 'pvc-uid',
        annotations: { binding: 'keep' },
      },
      spec: {
        ...volume.spec,
        volumeName: 'bound-pv',
        volumeMode: 'Filesystem',
      },
      status: { phase: 'Bound' },
    };
    const auth = {
      apiVersion: 'tesselar.io/v1',
      kind: 'AuthClient',
      metadata: {
        name: 'sso',
        namespace: 'podinfo',
        resourceVersion: '4',
        uid: 'auth-uid',
        labels: { keep: 'yes' },
      },
      spec: {
        redirectUris: ['https://old.example.com/callback'],
        postLogoutRedirectUris: ['https://old.example.com/logout'],
      },
    };
    const writes: string[] = [];
    const bodies: unknown[] = [];
    server.use(
      http.get(endpoint, () => HttpResponse.json(storedApp())),
      http.get(volumeEndpoint, () => HttpResponse.json(boundVolume)),
      http.get(authEndpoint, () => HttpResponse.json(auth)),
      http.put(volumeEndpoint, async ({ request }) => {
        writes.push('volume');
        const body: unknown = await request.json();
        bodies.push(body);
        return respond(body);
      }),
      http.put(authEndpoint, async ({ request }) => {
        writes.push('auth');
        const body: unknown = await request.json();
        bodies.push(body);
        return respond(body);
      }),
      http.put(endpoint, async ({ request }) => {
        writes.push('app');
        const body: unknown = await request.json();
        bodies.push(body);
        return respond(body);
      }),
    );
    await expect(updateApp(bundle)).resolves.toEqual({ success: true });
    expect(writes).toEqual(['volume', 'auth', 'app']);
    expect(bodies[0]).toMatchObject({
      metadata: boundVolume.metadata,
      spec: {
        volumeName: 'bound-pv',
        volumeMode: 'Filesystem',
        resources: { requests: { storage: '2Gi' } },
      },
      status: { phase: 'Bound' },
    });
    expect(bodies[1]).toEqual({
      ...auth,
      spec: { redirectUris: ['https://podinfo.example.com/callback'] },
    });
    expect(bodies[2]).toMatchObject({ spec: bundle.app.spec });
  });

  it('does not save the App when an additional resource write fails', async () => {
    let appWrites = 0;
    server.use(
      http.get(endpoint, () => HttpResponse.json(storedApp())),
      http.get(volumeEndpoint, () =>
        HttpResponse.json({ code: 403 }, { status: 403 }),
      ),
      http.put(endpoint, () => {
        appWrites += 1;
        return HttpResponse.json({});
      }),
    );
    await expect(updateApp(appWithResources())).rejects.toThrow();
    expect(appWrites).toBe(0);
  });

  it('adds supporting resources to an existing App', async () => {
    const writes: string[] = [];
    server.use(
      http.get(endpoint, () => HttpResponse.json(storedApp())),
      http.get(volumeEndpoint, () =>
        HttpResponse.json({ code: 404 }, { status: 404 }),
      ),
      http.get(authEndpoint, () =>
        HttpResponse.json({ code: 404 }, { status: 404 }),
      ),
      http.post(
        'https://cluster.test/api/v1/namespaces/podinfo/persistentvolumeclaims',
        async ({ request }) => {
          writes.push('volume');
          return respond(await request.json());
        },
      ),
      http.post(
        'https://cluster.test/apis/tesselar.io/v1/namespaces/podinfo/authclients',
        async ({ request }) => {
          writes.push('auth');
          return respond(await request.json());
        },
      ),
      http.put(endpoint, async ({ request }) => {
        writes.push('app');
        return respond(await request.json());
      }),
    );
    await expect(updateApp(appWithResources())).resolves.toEqual({
      success: true,
    });
    expect(writes).toEqual(['volume', 'auth', 'app']);
  });
  it('constructs PVC manifests from typed list items without TypeMeta', async () => {
    const input = appWithResources();
    const items = input.additionalResources.map(({ metadata, spec }) => ({
      metadata,
      spec,
    }));
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ ...storedApp(), spec: input.app.spec }),
      ),
      http.get(
        'https://cluster.test/api/v1/namespaces/podinfo/persistentvolumeclaims',
        () => HttpResponse.json({ items: [items[0]] }),
      ),
      http.get(
        'https://cluster.test/apis/tesselar.io/v1/namespaces/podinfo/authclients',
        () => HttpResponse.json({ items: [input.additionalResources[1]] }),
      ),
    );
    const loaded = await getApp({ appName: 'podinfo' });
    expect(loaded.additionalResources).toEqual(input.additionalResources);
  });
  it.each([
    { type: 'volume', field: 'apiVersion', value: 'apps/v1' },
    { type: 'volume', field: 'kind', value: 'Secret' },
    { type: 'auth', field: 'apiVersion', value: 'tesselar.io/v2' },
    { type: 'auth', field: 'kind', value: 'App' },
  ])(
    'rejects unexpected $type $field instead of replacing it',
    async ({ type, field, value }) => {
      const input = appWithResources();
      const resource = input.additionalResources.find(
        (item) =>
          item.kind ===
          (type === 'volume' ? 'PersistentVolumeClaim' : 'AuthClient'),
      );
      const collection =
        type === 'volume'
          ? 'api/v1/namespaces/podinfo/persistentvolumeclaims'
          : 'apis/tesselar.io/v1/namespaces/podinfo/authclients';
      server.use(
        http.get(endpoint, () => HttpResponse.json(storedApp())),
        http.get(`https://cluster.test/${collection}`, () =>
          HttpResponse.json({ items: [{ ...resource, [field]: value }] }),
        ),
      );
      await expect(getApp({ appName: 'podinfo' })).rejects.toMatchObject({
        issues: [
          expect.objectContaining({ path: expect.arrayContaining([field]) }),
        ],
      });
    },
  );

  it('rejects AuthClient list items without type metadata', async () => {
    const clients = appWithResources()
      .additionalResources.filter((item) => item.kind === 'AuthClient')
      .map(({ metadata, spec }) => ({ metadata, spec }));
    server.use(
      http.get(endpoint, () => HttpResponse.json(storedApp())),
      http.get(
        'https://cluster.test/apis/tesselar.io/v1/namespaces/podinfo/authclients',
        () => HttpResponse.json({ items: clients }),
      ),
    );
    await expect(getApp({ appName: 'podinfo' })).rejects.toThrow();
  });
});
