import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vol } from 'memfs';
import { produce } from 'immer';
import { getAppConfig } from '../(dashboard)/apps/config';
import {
  discardDraft,
  getDraftDir,
  getApp,
  listApps,
  listDrafts,
  openWith,
  watchApp,
} from './app-workspaces';
import { createApp } from './applications';
import { baseAppBundle } from '../../test-utils/fixtures';

type WatchEvent = { eventType: string; filename: string | null };
type WatchEventResolver = (
  value: IteratorResult<WatchEvent, undefined>,
) => void;

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
  watchMock: vi.fn<
    (
      path: string,
      options: { recursive?: boolean },
    ) => AsyncIterableIterator<{ eventType: string; filename: string | null }>
  >(),
}));

vi.mock('server-only', () => ({}));

vi.mock('../(dashboard)/apps/config', () => ({
  getAppConfig: vi.fn(),
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

const mockGetAppConfig = vi.mocked(getAppConfig);

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

describe('draft workspaces', () => {
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

        return new Promise<
          IteratorResult<WatchEvent, undefined>
        >((resolve) => {
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
