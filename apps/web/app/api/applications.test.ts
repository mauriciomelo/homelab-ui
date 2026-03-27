import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLiveApps,
  reconcileFluxGitRepository,
  restartApp,
} from './applications';
import { APP_STATUS } from '@/app/constants';
import { produce } from 'immer';
import { baseAppManifest } from '../../test-utils/fixtures';

const { listClusterCustomObjectMock, patchNamespacedDeploymentMock, patchNamespacedCustomObjectMock } = vi.hoisted(() => ({
  listClusterCustomObjectMock: vi.fn<() => Promise<unknown>>(async () => ({ items: [] })),
  patchNamespacedDeploymentMock: vi.fn<
    (input: { name: string; namespace: string; body: unknown }) => Promise<void>
  >(async () => undefined),
  patchNamespacedCustomObjectMock: vi.fn<
    (input: {
      namespace: string;
      group: string;
      version: string;
      plural: string;
      name: string;
      body: unknown;
    }) => Promise<void>
  >(async () => undefined),
}));

vi.mock('./k8s', () => ({
  customObjectsApi: vi.fn().mockReturnValue({
    listClusterCustomObject: listClusterCustomObjectMock,
    patchNamespacedCustomObject: patchNamespacedCustomObjectMock,
  }),
  appsApi: vi.fn().mockReturnValue({
    patchNamespacedDeployment: patchNamespacedDeploymentMock,
  }),
  coreApi: vi.fn().mockReturnValue({}),
}));

describe('applications cluster operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLiveApps', () => {
    it('returns parsed live apps from the cluster', async () => {
      listClusterCustomObjectMock.mockResolvedValueOnce({
        items: [
          {
            ...produce(baseAppManifest, (draft) => {
              draft.metadata.name = 'demo-app';
            }),
            status: {
              phase: APP_STATUS.RUNNING,
              placements: [],
              conditions: [],
            },
          },
        ],
      });

      await expect(getLiveApps()).resolves.toEqual([
        {
          ...produce(baseAppManifest, (draft) => {
            draft.metadata.name = 'demo-app';
          }),
          status: {
            phase: APP_STATUS.RUNNING,
            placements: [],
            conditions: [],
          },
        },
      ]);
    });

    it('returns an empty list when the cluster app resource is missing', async () => {
      listClusterCustomObjectMock.mockRejectedValueOnce({ code: 404 });

      await expect(getLiveApps()).resolves.toEqual([]);
    });

    it('rethrows unexpected cluster errors', async () => {
      const clusterError = new Error('cluster unavailable');
      listClusterCustomObjectMock.mockRejectedValueOnce(clusterError);

      await expect(getLiveApps()).rejects.toThrow('cluster unavailable');
    });
  });

  describe('restartApp', () => {
    it('patches the namespaced deployment restart annotation', async () => {
      await restartApp('demo-app');

      expect(patchNamespacedDeploymentMock).toHaveBeenCalledWith({
        name: 'demo-app',
        namespace: 'demo-app',
        body: [
          {
            op: 'replace',
            path: '/spec/template/metadata/annotations',
            value: {
              'kubectl.kubernetes.io/restartedAt': expect.any(String),
            },
          },
        ],
      });
    });
  });

  describe('reconcileFluxGitRepository', () => {
    it('patches the Flux GitRepository reconcile annotation', async () => {
      await reconcileFluxGitRepository({
        name: 'flux-system',
        namespace: 'flux-system',
      });

      expect(patchNamespacedCustomObjectMock).toHaveBeenCalledWith({
        namespace: 'flux-system',
        group: 'source.toolkit.fluxcd.io',
        version: 'v1',
        plural: 'gitrepositories',
        name: 'flux-system',
        body: [
          {
            op: 'add',
            path: '/metadata/annotations',
            value: {
              'reconcile.fluxcd.io/requestedAt': expect.any(String),
            },
          },
        ],
      });
    });

    it('swallows unexpected reconcile errors', async () => {
      patchNamespacedCustomObjectMock.mockRejectedValueOnce(
        new Error('reconcile failed'),
      );

      await expect(
        reconcileFluxGitRepository({
          name: 'flux-system',
          namespace: 'flux-system',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
