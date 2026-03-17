import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import { produce } from 'immer';

import { registerAppController } from './app-controller';
import { baseAppManifest } from '@/test-utils/fixtures';

const {
  mockApiextensionsV1ApiClient,
  mockAppsApiClient,
  mockCoreApiClient,
  mockNetworkingApiClient,
  mockWatch,
} = vi.hoisted(() => {
  return {
    mockApiextensionsV1ApiClient: {
      readCustomResourceDefinition: vi.fn(),
      createCustomResourceDefinition: vi.fn(),
    },
    mockAppsApiClient: {
      readNamespacedDeployment: vi.fn(),
      createNamespacedDeployment: vi.fn(),
      replaceNamespacedDeployment: vi.fn(),
    },
    mockCoreApiClient: {
      readNamespacedConfigMap: vi.fn(),
      readNamespacedService: vi.fn(),
      createNamespacedService: vi.fn(),
      replaceNamespacedService: vi.fn(),
    },
    mockNetworkingApiClient: {
      readNamespacedIngress: vi.fn(),
      createNamespacedIngress: vi.fn(),
      replaceNamespacedIngress: vi.fn(),
    },
    mockWatch: {
      watch: vi.fn(),
    },
  };
});

vi.mock('@kubernetes/client-node', async (importOriginal) => {
  const mod = await importOriginal<typeof k8s>();

  class MockKubeConfig {
    loadFromDefault = vi.fn();
    makeApiClient = vi.fn((client) => {
      if (client === mod.ApiextensionsV1Api) {
        return mockApiextensionsV1ApiClient;
      }

      if (client === mod.AppsV1Api) {
        return mockAppsApiClient;
      }

      if (client === mod.CoreV1Api) {
        return mockCoreApiClient;
      }

      if (client === mod.NetworkingV1Api) {
        return mockNetworkingApiClient;
      }

      return {};
    });
  }

  return {
    ...mod,
    KubeConfig: MockKubeConfig,
    Watch: vi.fn().mockImplementation(function () {
      return mockWatch;
    }),
  };
});

describe('registerAppController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAppsApiClient.readNamespacedDeployment.mockRejectedValue({ code: 404 });
    mockAppsApiClient.createNamespacedDeployment.mockResolvedValue({});
    mockAppsApiClient.replaceNamespacedDeployment.mockResolvedValue({});

    mockCoreApiClient.readNamespacedConfigMap.mockResolvedValue({
      data: { domain: 'home.mauriciomelo.io' },
    });
    mockCoreApiClient.readNamespacedService.mockRejectedValue({ code: 404 });
    mockCoreApiClient.createNamespacedService.mockResolvedValue({});
    mockCoreApiClient.replaceNamespacedService.mockResolvedValue({});

    mockNetworkingApiClient.readNamespacedIngress.mockRejectedValue({
      code: 404,
    });
    mockNetworkingApiClient.createNamespacedIngress.mockResolvedValue({});
    mockNetworkingApiClient.replaceNamespacedIngress.mockResolvedValue({});
  });

  it('creates the App CRD if it does not exist', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockRejectedValue(
      {
        code: 404,
      },
    );
    mockApiextensionsV1ApiClient.createCustomResourceDefinition.mockResolvedValue(
      {},
    );

    await registerAppController();

    expect(
      mockApiextensionsV1ApiClient.createCustomResourceDefinition,
    ).toHaveBeenCalledWith({
      body: expect.objectContaining({
        metadata: { name: 'apps.tesselar.io' },
        spec: expect.objectContaining({
          group: 'tesselar.io',
          names: expect.objectContaining({ kind: 'App', plural: 'apps' }),
        }),
      }),
    });
  });

  it('creates generated runtime resources on ADDED', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockResolvedValue(
      {},
    );

    await registerAppController();

    const watchCallback = mockWatch.watch.mock.calls[0][2];
    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = 'demo-app';
      draft.spec.ports = [{ name: 'web', containerPort: 8080 }];
      draft.spec.ingress = { port: { name: 'web' } };
      draft.spec.volumeMounts = [{ name: 'data', mountPath: '/data' }];
      draft.spec.health = {
        check: {
          type: 'httpGet',
          path: '/healthz',
          port: 'web',
        },
      };
    });

    await watchCallback('ADDED', {
      ...app,
      metadata: {
        ...app.metadata,
        namespace: 'demo-app',
        uid: 'app-uid',
      },
    });

    expect(mockAppsApiClient.createNamespacedDeployment).toHaveBeenCalledWith({
      namespace: 'demo-app',
      body: expect.objectContaining({
        metadata: expect.objectContaining({
          name: 'demo-app',
          namespace: 'demo-app',
          labels: expect.objectContaining({
            'app.kubernetes.io/managed-by': 'tesselar-app-controller',
          }),
          ownerReferences: [
            expect.objectContaining({
              name: 'demo-app',
              uid: 'app-uid',
              controller: true,
            }),
          ],
        }),
        spec: expect.objectContaining({
          strategy: { type: 'Recreate' },
          template: expect.objectContaining({
            spec: expect.objectContaining({
              containers: [
                expect.objectContaining({
                  image: app.spec.image,
                  startupProbe: expect.objectContaining({
                    httpGet: { path: '/healthz', port: 'web' },
                  }),
                  volumeMounts: [{ name: 'data', mountPath: '/data' }],
                }),
              ],
              volumes: [
                {
                  name: 'data',
                  persistentVolumeClaim: { claimName: 'data' },
                },
              ],
            }),
          }),
        }),
      }),
    });

    expect(mockCoreApiClient.createNamespacedService).toHaveBeenCalledWith({
      namespace: 'demo-app',
      body: expect.objectContaining({
        metadata: expect.objectContaining({
          name: 'demo-app',
          namespace: 'demo-app',
        }),
        spec: expect.objectContaining({
          ports: [
            expect.objectContaining({
              name: 'web',
              port: 8080,
              targetPort: 'web',
            }),
          ],
        }),
      }),
    });

    expect(
      mockNetworkingApiClient.createNamespacedIngress,
    ).toHaveBeenCalledWith({
      namespace: 'demo-app',
      body: expect.objectContaining({
        metadata: expect.objectContaining({
          name: 'demo-app',
          namespace: 'demo-app',
        }),
        spec: expect.objectContaining({
          rules: [
            expect.objectContaining({
              host: 'demo-app.home.mauriciomelo.io',
            }),
          ],
        }),
      }),
    });
  });

  it('replaces generated runtime resources on MODIFIED', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockResolvedValue(
      {},
    );
    mockAppsApiClient.readNamespacedDeployment.mockResolvedValue({
      metadata: { resourceVersion: '1' },
    });
    mockCoreApiClient.readNamespacedService.mockResolvedValue({
      metadata: { resourceVersion: '2' },
    });
    mockNetworkingApiClient.readNamespacedIngress.mockResolvedValue({
      metadata: { resourceVersion: '3' },
    });

    await registerAppController();

    const watchCallback = mockWatch.watch.mock.calls[0][2];
    const app = produce(baseAppManifest, (draft) => {
      draft.metadata.name = 'demo-app';
      draft.spec.image = 'redis:7-alpine';
    });

    await watchCallback('MODIFIED', {
      ...app,
      metadata: {
        ...app.metadata,
        namespace: 'demo-app',
        uid: 'app-uid',
      },
    });

    expect(mockAppsApiClient.replaceNamespacedDeployment).toHaveBeenCalledWith({
      name: 'demo-app',
      namespace: 'demo-app',
      body: expect.objectContaining({
        metadata: expect.objectContaining({ resourceVersion: '1' }),
      }),
    });
    expect(mockCoreApiClient.replaceNamespacedService).toHaveBeenCalledWith({
      name: 'demo-app',
      namespace: 'demo-app',
      body: expect.objectContaining({
        metadata: expect.objectContaining({ resourceVersion: '2' }),
      }),
    });
    expect(
      mockNetworkingApiClient.replaceNamespacedIngress,
    ).toHaveBeenCalledWith({
      name: 'demo-app',
      namespace: 'demo-app',
      body: expect.objectContaining({
        spec: expect.objectContaining({
          rules: [
            expect.objectContaining({
              host: 'demo-app.home.mauriciomelo.io',
            }),
          ],
        }),
        metadata: expect.objectContaining({ resourceVersion: '3' }),
      }),
    });
  });
});
