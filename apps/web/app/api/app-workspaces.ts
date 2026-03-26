import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import z from 'zod/v4';
import {
  getAppDir,
  getAppsDir,
  readAppBundleFromDirectory,
} from './applications';
import type { AppBundleSchema } from './schemas';

export const openWithTargetSchema = z.enum(['finder', 'terminal', 'vscode']);

const openWithInputSchema = z
  .object({
    target: openWithTargetSchema,
    appName: z.string().min(1).optional(),
    draftId: z.string().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    const targetCount =
      Number(input.appName !== undefined) + Number(input.draftId !== undefined);

    if (targetCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide exactly one of appName or draftId',
        path: ['appName'],
      });
    }
  });

export async function getDraft(draftId: string) {
  const parsedDraftId = z.string().min(1).parse(draftId);
  const draftDir = getDraftDir(parsedDraftId);
  const bundle = await readAppBundleFromDirectory(draftDir);

  return {
    draftId: parsedDraftId,
    bundle: {
      ...bundle,
      draftId: parsedDraftId,
    },
  };
}

export type DraftApp = AppBundleSchema & {
  draftId: string;
};

export async function listDrafts(): Promise<DraftApp[]> {
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
          } satisfies DraftApp;
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
  const targetPath = parsedInput.draftId
    ? getDraftDir(parsedInput.draftId)
    : getAppDir(parsedInput.appName ?? '');

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
