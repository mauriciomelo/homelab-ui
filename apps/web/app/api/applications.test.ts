import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLiveApps,
  reconcileFluxGitRepository,
  restartApp,
  watchLiveApps,
} from './applications';
import { APP_STATUS } from '@/app/constants';
import { produce } from 'immer';
import { baseAppManifest } from '../../test-utils/fixtures';

const { listClusterCustomObjectMock, patchNamespacedDeploymentMock, patchNamespacedCustomObjectMock, watchMock, watchAbortMock } = vi.hoisted(() => ({
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
  watchMock: vi.fn(),
  watchAbortMock: vi.fn(),
}));

function getWatchCallback(): ((type: string, obj: unknown) => Promise<void>) {
  const callback = watchMock.mock.calls[0]?.[2];

  if (typeof callback !== 'function') {
    throw new Error('Expected watch callback to be registered');
  }

  return callback;
}

vi.mock('./k8s', () => ({
  createWatch: vi.fn().mockReturnValue({
    watch: watchMock,
  }),
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
    watchMock.mockResolvedValue({
      abort: watchAbortMock,
    });
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

  describe('watchLiveApps', () => {
    it('yields the initial snapshot and updated snapshots on watch events', async () => {
      listClusterCustomObjectMock
        .mockResolvedValueOnce({
          items: [],
        })
        .mockResolvedValueOnce({
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

      const iterator = watchLiveApps();

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: [],
      });

      const nextPromise = iterator.next();
      const onEvent = getWatchCallback();

      await onEvent('MODIFIED', {});

      await expect(nextPromise).resolves.toEqual({
        done: false,
        value: [
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

      await iterator.return(undefined);

      expect(watchAbortMock).toHaveBeenCalledTimes(1);
    });

    it('ignores bookmark events', async () => {
      listClusterCustomObjectMock.mockResolvedValue({
        items: [],
      });

      const iterator = watchLiveApps();

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: [],
      });

      const onEvent = getWatchCallback();

      await onEvent('BOOKMARK', {});

      expect(listClusterCustomObjectMock).toHaveBeenCalledTimes(1);

      await iterator.return(undefined);
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
