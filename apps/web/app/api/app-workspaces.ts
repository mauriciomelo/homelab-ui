import { execFile } from 'child_process';
import { APP_STATUS } from '@/app/constants';
import { logger } from '@/lib/logger';
import { controlPlaneOrpcServerClient } from '@/control-plane-orpc/server-client';
import fs from 'fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { watch } from 'node:fs/promises';
import path from 'path';
import YAML from 'yaml';
import z from 'zod/v4';
import { getAppConfig } from '../(dashboard)/apps/config';
import {
  appBundleIdentifierSchema,
  isDraftAppBundleIdentifier,
  parseAppBundleIdentifier,
  type AppBundleIdentifier,
} from './app-bundle-identifier';
import { type AppRuntimeStatus, type LiveApp } from './applications';
import { toManifests } from './app-k8s-adapter';
import {
  appBundleSchema,
  appSchema,
  appStatusSchema,
  authClientSchema,
  kustomizationSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
} from './schemas';
import type { AppBundleSchema } from './schemas';

const appWorkspacesLogger = logger.child({ module: 'app-workspaces-api' });

export const openWithTargetSchema = z.enum([
  'finder',
  'terminal',
  'vscode',
  'cursor',
  'ghostty',
]);

export type AppResourceType =
  | z.infer<typeof appSchema>
  | z.infer<typeof authClientSchema>
  | z.infer<typeof kustomizationSchema>
  | z.infer<typeof persistentVolumeClaimSchema>
  | z.infer<typeof namespaceSchema>;

type AdditionalResourceSchema =
  | z.infer<typeof authClientSchema>
  | z.infer<typeof persistentVolumeClaimSchema>;

export type PublishedAppBundle = AppBundleSchema & {
  status: AppRuntimeStatus;
};

export const publishedAppBundleSchema = appBundleSchema.safeExtend({
  status: appStatusSchema,
});

export const draftAppBundleSchema = appBundleSchema.safeExtend({
  draftId: z.string().min(1),
});

export const appBundleListItemSchema = z.union([
  publishedAppBundleSchema,
  draftAppBundleSchema,
]);

export const appBundleListSchema = z.array(appBundleListItemSchema);

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

export async function createApp(appBundle: AppBundleSchema) {
  const parsedAppBundle = appBundleSchema.parse(appBundle);

  await writeAppBundleToDirectory(
    getBundleDir(parsedAppBundle),
    parsedAppBundle,
  );

  return { success: true };
}

export async function updateApp(appBundle: AppBundleSchema) {
  const parsedAppBundle = appBundleSchema.parse(appBundle);
  const appName = parsedAppBundle.app.metadata.name;
  const appDir = getBundleDir(parsedAppBundle);

  try {
    await writeAppBundleToDirectory(appDir, parsedAppBundle);

    return { success: true };
  } catch (error) {
    appWorkspacesLogger.error(
      { appName, err: error, operation: 'update-app' },
      'Failed to update app',
    );
    throw new Error(
      `Failed to update app "${appName}": ${formatErrorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
}

export async function publishApp(appBundle: AppBundleSchema) {
  const parsedAppBundle = appBundleSchema.parse(appBundle);
  const appName = parsedAppBundle.app.metadata.name;

  await writeAppBundleToDirectory(getAppDir(appName), parsedAppBundle);

  await commitAndPushChanges(
    appName,
    `${parsedAppBundle.draftId ? 'Create' : 'Update'} app ${appName}`,
  );

  if (parsedAppBundle.draftId) {
    await fs.promises.rm(getDraftDir(parsedAppBundle.draftId), {
      recursive: true,
      force: true,
    });
  }

  return { success: true };
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

export function watchApps<TInput extends ListAppsInput>(
  input: TInput,
): AsyncGenerator<
  TInput['includeDrafts'] extends true
    ? AppBundleListItem[]
    : PublishedAppBundle[]
>;
export function watchApps(): AsyncGenerator<PublishedAppBundle[]>;
export async function* watchApps(
  input: unknown = {},
): AsyncGenerator<AppBundleListItem[] | PublishedAppBundle[]> {
  const parsedInput = listAppsInputSchema.parse(input);
  const fsWatcherIterator = watch(getAppsDir(), {
    recursive: true,
  })[Symbol.asyncIterator]();
  const liveAppsIterator =
    await controlPlaneOrpcServerClient.apps.watchLiveApps();

  try {
    yield await listApps(parsedInput);

    for (;;) {
      const nextEvent = await Promise.race([
        fsWatcherIterator.next().then((result) => ({ source: 'fs', result })),
        liveAppsIterator.next().then((result) => ({ source: 'live', result })),
      ]);

      if (nextEvent.result.done) {
        return;
      }

      yield await listApps(parsedInput);
    }
  } finally {
    await fsWatcherIterator.return?.();
    await liveAppsIterator.return();
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

export async function getPersistedPublishedAppBundles() {
  const appDir = getAppsDir();
  const entries = await fs.promises.readdir(appDir, {
    withFileTypes: true,
  });
  const appListPromises = entries
    .filter((entry) => entry.isDirectory() && entry.name !== '.drafts')
    .map((entry) => getPersistedAppByName(entry.name));

  const settled = await Promise.allSettled(appListPromises);

  settled.forEach((result) => {
    if (result.status === 'rejected') {
      appWorkspacesLogger.error({ err: result.reason }, 'Error fetching app');
    }
  });

  const fulfilled = settled.filter((result) => result.status === 'fulfilled');

  return fulfilled.map((result) => result.value);
}

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
  const [persistedApps, liveApps] = await Promise.all([
    getPersistedPublishedAppBundles(),
    getLiveAppsFromControlPlane(),
  ]);

  return buildAppListSnapshot(parsedInput, persistedApps, liveApps);
}

async function buildAppListSnapshot(
  input: ListAppsInput,
  persistedApps: PublishedAppBundle[],
  liveApps: LiveApp[],
): Promise<AppBundleListItem[] | PublishedAppBundle[]> {
  const apps = mergeLiveApps(persistedApps, liveApps);

  if (!input.includeDrafts) {
    return apps;
  }

  const drafts = await listDrafts();

  return [...drafts, ...apps];
}

function mergeLiveApps(
  persistedApps: PublishedAppBundle[],
  liveApps: LiveApp[],
): PublishedAppBundle[] {
  const liveStatusesByName = new Map(
    liveApps.map((app) => [app.metadata.name, app.status]),
  );

  return persistedApps.map((app) => ({
    ...app,
    status:
      liveStatusesByName.get(app.app.metadata.name) ?? getUnknownAppStatus(),
  }));
}

function getUnknownAppStatus(): AppRuntimeStatus {
  return appStatusSchema.parse({
    phase: APP_STATUS.UNKNOWN,
    placements: [],
    conditions: [],
  });
}

async function getPersistedAppByName(name: string) {
  const { app, additionalResources } = await getManifestsFromAppFiles(name);

  return {
    app,
    additionalResources,
    status: getUnknownAppStatus(),
  } satisfies PublishedAppBundle;
}

function createPersistedAppManifest(
  app: z.infer<typeof appSchema>,
): z.infer<typeof appSchema> {
  return app;
}

export async function getFile<T>({
  path: filePath,
  schema,
}: {
  path: string;
  schema: z.ZodType<T>;
}): Promise<{ data: T; raw: unknown }> {
  const fileText = await fs.promises.readFile(filePath, 'utf-8');

  const documents = YAML.parseAllDocuments(fileText.toString());
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw errors[0];
  }

  const rawDocuments = documents.map((document) => document.toJSON());
  if (rawDocuments.length === 1) {
    const raw = rawDocuments[0];
    return { data: schema.parse(raw), raw };
  }

  const matched = rawDocuments.find((raw) => schema.safeParse(raw).success);
  if (!matched) {
    throw new Error('No matching document found');
  }

  return { data: schema.parse(matched), raw: matched };
}

async function getManifestsFromAppFiles(appName: string): Promise<{
  app: z.infer<typeof appSchema>;
  additionalResources: AdditionalResourceSchema[];
}> {
  const appPath = getAppDir(appName);
  return readAppBundleFromDirectory(appPath);
}

export async function readAppBundleFromDirectory(appPath: string): Promise<{
  app: z.infer<typeof appSchema>;
  additionalResources: AdditionalResourceSchema[];
}> {
  const requiredFiles = new Set(['app.yaml', 'namespace.yaml']);

  const kustomizationResult = await getFile({
    path: `${appPath}/kustomization.yaml`,
    schema: kustomizationSchema,
  });

  const kustomizationResources = new Set(kustomizationResult.data.resources);
  const additionalResourcesFileNames =
    kustomizationResources.difference(requiredFiles);
  const appResult = await getCanonicalApp(appPath);

  function schemaForFile(
    filename: string,
  ): z.ZodType<AdditionalResourceSchema> | undefined {
    if (filename.match(/\.authclient\.yaml$/)) {
      return authClientSchema;
    }

    if (filename.match(/\.persistentvolumeclaim\.yaml$/)) {
      return persistentVolumeClaimSchema;
    }

    return undefined;
  }

  const additionalResources = await Promise.all(
    Array.from(additionalResourcesFileNames).map(async (resourceFile) => {
      const schema = schemaForFile(resourceFile);
      if (!schema) {
        return;
      }

      const { data } = await getFile({
        path: `${appPath}/${resourceFile}`,
        schema,
      });

      return data;
    }),
  );

  return {
    app: appResult,
    additionalResources: additionalResources.filter(
      (resource) => resource !== undefined,
    ),
  };
}

export async function writeAppBundleToDirectory(
  appDir: string,
  appBundle: AppBundleSchema,
) {
  const parsedAppBundle = appBundleSchema.parse(appBundle);
  const appManifest = createPersistedAppManifest(parsedAppBundle.app);
  const { namespace } = toManifests(appManifest);

  await writeResourcesToDirectory(appDir, parsedAppBundle.app.metadata.name, [
    appManifest,
    namespace,
    ...parsedAppBundle.additionalResources,
  ]);
}

function formatErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const issuePath = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${issuePath}: ${issue.message}`;
      })
      .join('; ');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function commitAndPushChanges(appName: string, message: string) {
  const appDir = getAppDir(appName);
  const appConfig = getAppConfig();

  await git.add({
    fs,
    dir: appConfig.PROJECT_DIR,
    filepath: path.relative(appConfig.PROJECT_DIR, appDir),
  });

  await git.commit({
    fs,
    dir: appConfig.PROJECT_DIR,
    message,
    author: {
      name: appConfig.USER_NAME,
      email: appConfig.USER_EMAIL,
    },
  });

  await git.push({
    fs,
    http,
    dir: appConfig.PROJECT_DIR,
    remote: 'origin',
    ref: 'main',
    onAuth: () => ({ username: appConfig.GITHUB_TOKEN }),
  });

  await reconcileFluxGitRepository({
    name: 'flux-system',
    namespace: 'flux-system',
  });
}

async function getLiveAppsFromControlPlane(): Promise<LiveApp[]> {
  return controlPlaneOrpcServerClient.apps.getLiveApps();
}

async function reconcileFluxGitRepository(input: {
  name: string;
  namespace: string;
}) {
  return controlPlaneOrpcServerClient.apps.reconcileFluxGitRepository(input);
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

export function getAppsDir() {
  const config = getAppConfig();
  return path.join(
    config.PROJECT_DIR,
    'clusters',
    config.CLUSTER_NAME,
    'my-applications',
  );
}

export function getAppDir(appName: string) {
  return path.join(getAppsDir(), appName);
}

export function getDraftDir(draftId: string) {
  return path.join(getDraftsDir(), draftId);
}

function getBundleDir(appBundle: AppBundleSchema) {
  return appBundle.draftId
    ? getDraftDir(appBundle.draftId)
    : getAppDir(appBundle.app.metadata.name);
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

  if (target === 'ghostty') {
    return {
      command: 'open',
      args: ['-a', 'Ghostty', targetPath],
    };
  }

  if (target === 'cursor') {
    return {
      command: 'open',
      args: ['-a', 'Cursor', targetPath],
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

async function getCanonicalApp(
  appPath: string,
): Promise<z.infer<typeof appSchema>> {
  const { data } = await getFile({
    path: `${appPath}/app.yaml`,
    schema: appSchema,
  });

  return data;
}

function getFileName(resource: AppResourceType) {
  if (resource.kind === 'App') {
    return 'app.yaml';
  }

  if (resource.kind === 'Kustomization' || resource.kind === 'Namespace') {
    return `${resource.kind.toLowerCase()}.yaml`;
  }

  return `${resource.metadata.name}.${resource.kind.toLowerCase()}.yaml`;
}

async function writeResourcesToDirectory(
  appDir: string,
  appName: string,
  resources: AppResourceType[],
) {
  const files = resources.map((resource) => {
    const filename = getFileName(resource);
    return { filename, textContent: YAML.stringify(resource) };
  });

  const kustomization = {
    apiVersion: 'kustomize.config.k8s.io/v1beta1',
    kind: 'Kustomization' as const,
    metadata: { name: appName },
    namespace: appName,
    resources: files.map((file) => file.filename),
  } satisfies z.infer<typeof kustomizationSchema>;

  const kustomizationFile = {
    filename: getFileName(kustomization),
    textContent: YAML.stringify(kustomization),
  };

  await fs.promises.mkdir(appDir, { recursive: true });

  await Promise.all(
    [...files, kustomizationFile].map(async (resource) => {
      await fs.promises.writeFile(
        `${appDir}/${resource.filename}`,
        resource.textContent,
      );
    }),
  );

  await deleteObsoleteGeneratedFiles(appDir);
}

async function deleteObsoleteGeneratedFiles(appDir: string) {
  await Promise.all(
    ['deployment.yaml', 'service.yaml', 'ingress.yaml'].map(
      async (filename) => {
        const filePath = `${appDir}/${filename}`;

        try {
          await fs.promises.unlink(filePath);
        } catch (error) {
          if (!isMissingFileError(error)) {
            throw error;
          }
        }
      },
    ),
  );
}

function isMissingFileError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
