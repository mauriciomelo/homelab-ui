import { execFile } from 'child_process';
import { logger } from '@/lib/logger';
import fs from 'fs';
import { watch } from 'node:fs/promises';
import path from 'path';
import z from 'zod/v4';
import {
  appBundleIdentifierSchema,
  isDraftAppBundleIdentifier,
  parseAppBundleIdentifier,
  type AppBundleIdentifier,
} from './app-bundle-identifier';
import {
  getApps,
  getAppDir,
  getAppsDir,
  readAppBundleFromDirectory,
  type PublishedAppBundle,
} from './applications';
import type { AppBundleSchema } from './schemas';

const appWorkspacesLogger = logger.child({ module: 'app-workspaces-api' });

export const openWithTargetSchema = z.enum(['finder', 'terminal', 'vscode']);

const openWithInputSchema = z
  .object({
    target: openWithTargetSchema,
  })
  .and(appBundleIdentifierSchema);

export async function getApp(input: unknown): Promise<AppBundleSchema> {
  const parsedInput = parseAppBundleIdentifier(input);
  const targetDir = getAppBundlePath(parsedInput);
  const bundle = await readAppBundleFromDirectory(targetDir);

  return isDraftAppBundleIdentifier(parsedInput)
    ? {
        ...bundle,
        draftId: parsedInput.draftId,
      }
    : bundle;
}

export async function* watchApp(
  input: unknown,
): AsyncGenerator<AppBundleSchema> {
  const parsedInput = parseAppBundleIdentifier(input);

  yield await getApp(parsedInput);

  for await (const event of watch(getAppsDir(), { recursive: true })) {
    appWorkspacesLogger.debug({ event, target: parsedInput }, 'watchApp event');
    yield await getApp(parsedInput);
  }
}

export type DraftAppBundle = AppBundleSchema & {
  draftId: string;
};

export type AppBundleListItem = PublishedAppBundle | DraftAppBundle;

export const listAppsInputSchema = z.union([
  z.object({
    includeDrafts: z.literal(true),
  }),
  z.object({
    includeDrafts: z.literal(false).default(false),
  }),
]);

export type ListAppsInput = z.infer<typeof listAppsInputSchema>;

export function listApps<TInput extends ListAppsInput>(
  input: TInput,
): Promise<
  TInput['includeDrafts'] extends true
    ? AppBundleListItem[]
    : PublishedAppBundle[]
>;
export function listApps(): Promise<PublishedAppBundle[]>;
export async function listApps(
  input: unknown = {},
): Promise<AppBundleListItem[] | PublishedAppBundle[]> {
  const parsedInput = listAppsInputSchema.parse(input);
  const apps = await getApps();

  if (!parsedInput.includeDrafts) {
    return apps;
  }

  const drafts = await listDrafts();

  return [...drafts, ...apps];
}

export async function listDrafts(): Promise<DraftAppBundle[]> {
  try {
    const entries = await fs.promises.readdir(getDraftsDir(), {
      withFileTypes: true,
    });

    const drafts = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const bundle = await readAppBundleFromDirectory(
            getDraftDir(entry.name),
          );

          return {
            ...bundle,
            draftId: entry.name,
          } satisfies DraftAppBundle;
        }),
    );

    return drafts;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function discardDraft(draftId: string) {
  const parsedDraftId = z.string().min(1).parse(draftId);

  await fs.promises.rm(getDraftDir(parsedDraftId), {
    recursive: true,
    force: true,
  });

  return { success: true };
}

export async function openWith(input: unknown) {
  const parsedInput = openWithInputSchema.parse(input);
  const targetIdentifier = parseAppBundleIdentifier(parsedInput);
  const targetPath = getAppBundlePath(targetIdentifier);

  await fs.promises.access(targetPath, fs.constants.F_OK);

  const { command, args } = getOpenCommand(parsedInput.target, targetPath);
  await execFileAsync(command, args);

  return { success: true };
}

export function getDraftsDir() {
  return path.join(getAppsDir(), '.drafts');
}

export function getDraftDir(draftId: string) {
  return path.join(getDraftsDir(), draftId);
}

function getAppBundlePath(identifier: AppBundleIdentifier) {
  return isDraftAppBundleIdentifier(identifier)
    ? getDraftDir(identifier.draftId)
    : getAppDir(identifier.appName);
}

function getOpenCommand(
  target: z.infer<typeof openWithTargetSchema>,
  targetPath: string,
) {
  if (process.platform !== 'darwin') {
    throw new Error('openWith currently supports only macOS');
  }

  if (target === 'finder') {
    return {
      command: 'open',
      args: [targetPath],
    };
  }

  if (target === 'terminal') {
    return {
      command: 'open',
      args: ['-a', 'Terminal', targetPath],
    };
  }

  return {
    command: 'code',
    args: [targetPath],
  };
}

async function execFileAsync(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
