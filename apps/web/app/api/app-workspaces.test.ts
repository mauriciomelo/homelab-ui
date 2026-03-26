import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vol } from 'memfs';
import { produce } from 'immer';
import { getAppConfig } from '../(dashboard)/apps/config';
import {
  discardDraft,
  getDraft,
  getDraftDir,
  listDrafts,
  openWith,
} from './app-workspaces';
import { createApp } from './applications';
import { baseAppBundle } from '../../test-utils/fixtures';

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

vi.mock('server-only', () => ({}));

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

    const loadedDraft = await getDraft('draft-1');

    expect(loadedDraft.bundle.draftId).toBe('draft-1');
    expect(loadedDraft.bundle.app.metadata.name).toBe('draft-app');
    expect(loadedDraft.bundle.app.spec.image).toBe('nginx:latest');
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

    const loadedDraft = await getDraft('draft-1');

    expect(loadedDraft.bundle).toEqual(nextBundle);
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
