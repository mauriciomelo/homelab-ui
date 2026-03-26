import fs from 'fs';
import YAML from 'yaml';
import * as z from 'zod';
import { getAppConfig } from '../(dashboard)/apps/config';
import path from 'path';
import { AppBundleSchema, appBundleSchema } from './schemas';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { APP_STATUS } from '@/app/constants';
import { logger } from '@/lib/logger';
import {
  appStatusSchema,
  appSchema,
  authClientSchema,
  kustomizationSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
} from './schemas';
import * as k from './k8s';
import { toManifests } from './app-k8s-adapter';

export type AppResourceType =
  | z.infer<typeof appSchema>
  | z.infer<typeof authClientSchema>
  | z.infer<typeof kustomizationSchema>
  | z.infer<typeof persistentVolumeClaimSchema>
  | z.infer<typeof namespaceSchema>;

type AdditionalResourceSchema =
  | z.infer<typeof authClientSchema>
  | z.infer<typeof persistentVolumeClaimSchema>;

const applicationsLogger = logger.child({ module: 'applications-api' });

export type AppRuntimeStatus = z.infer<typeof appStatusSchema>;

export type App = AppBundleSchema & {
  status: AppRuntimeStatus;
};

export async function getApps() {
  const appDir = getAppsDir();
  const entries = await fs.promises.readdir(appDir, {
    withFileTypes: true,
  });
  const appListPromises = entries
    .filter((entry) => entry.isDirectory() && entry.name !== '.drafts')
    .map((entry) => getAppByName(entry.name));

  const settled = await Promise.allSettled(appListPromises);

  settled.forEach((result) => {
    if (result.status === 'rejected') {
      applicationsLogger.error({ err: result.reason }, 'Error fetching app');
    }
  });

  const fulfilled = settled.filter((result) => result.status === 'fulfilled');

  return fulfilled.map((result) => result.value);
}

export async function restartApp(name: string) {
  const patch = [
    {
      op: 'replace',
      path: '/spec/template/metadata/annotations',
      value: {
        'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
      },
    },
  ];
  await k.appsApi().patchNamespacedDeployment({
    name: name,
    namespace: name,
    body: patch,
  });
}

async function getAppByName(name: string) {
  const { app, additionalResources } = await getManifestsFromAppFiles(name);
  const status = await getAppRuntimeStatus(name);

  return {
    app,
    additionalResources,
    status,
  } satisfies App;
}

export async function updateApp(appBundle: AppBundleSchema) {
  const parsedAppBundle = appBundleSchema.parse(appBundle);
  const appName = parsedAppBundle.app.metadata.name;
  const appDir = getBundleDir(parsedAppBundle);

  try {
    await writeAppBundleToDirectory(appDir, parsedAppBundle);

    return { success: true };
  } catch (error) {
    applicationsLogger.error(
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

function formatErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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

  const allFiles = [...files, kustomizationFile];

  await fs.promises.mkdir(appDir, { recursive: true });

  await Promise.all(
    allFiles.map(async (resource) => {
      const filePath = `${appDir}/${resource.filename}`;

      await fs.promises.writeFile(filePath, resource.textContent);
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
          if (!isKubernetesNotFoundError(error) && !isMissingFileError(error)) {
            throw error;
          }
        }
      },
    ),
  );
}

async function commitAndPushChanges(appName: string, message: string) {
  const appDir = getAppDir(appName);

  await git.add({
    fs,
    dir: getAppConfig().PROJECT_DIR,
    filepath: path.relative(getAppConfig().PROJECT_DIR, appDir),
  });

  await git.commit({
    fs,
    dir: getAppConfig().PROJECT_DIR,
    message,
    author: {
      name: getAppConfig().USER_NAME,
      email: getAppConfig().USER_EMAIL,
    },
  });

  await git.push({
    fs,
    http,
    dir: getAppConfig().PROJECT_DIR,
    remote: 'origin',
    ref: 'main',
    onAuth: () => ({ username: getAppConfig().GITHUB_TOKEN }),
  });

  await reconcileFluxGitRepository({
    name: 'flux-system',
    namespace: 'flux-system',
  });
}

export async function createApp(appBundle: AppBundleSchema) {
  const parsedAppBundle = appBundleSchema.parse(appBundle);
  await writeAppBundleToDirectory(
    getBundleDir(parsedAppBundle),
    parsedAppBundle,
  );

  return { success: true };
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

export async function getFile<T>({
  path,
  schema,
}: {
  path: string;
  schema: z.ZodType<T>;
}): Promise<{ data: T; raw: unknown }> {
  const fileText = await fs.promises.readFile(path, 'utf-8');

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

async function getCanonicalApp(
  appPath: string,
): Promise<z.infer<typeof appSchema>> {
  const { data } = await getFile({
    path: `${appPath}/app.yaml`,
    schema: appSchema,
  });

  return data;
}

function createPersistedAppManifest(
  app: z.infer<typeof appSchema>,
): z.infer<typeof appSchema> {
  return app;
}

async function getAppRuntimeStatus(name: string): Promise<AppRuntimeStatus> {
  try {
    const appResource = await k
      .customObjectsApi()
      .getNamespacedCustomObjectStatus({
        group: 'tesselar.io',
        version: 'v1alpha1',
        namespace: name,
        plural: 'apps',
        name,
      });

    const parsed = appStatusSchema.safeParse(appResource.status);

    if (parsed.success) {
      return parsed.data;
    }
  } catch (error) {
    if (!isKubernetesNotFoundError(error)) {
      throw error;
    }
  }

  return appStatusSchema.parse({
    phase: APP_STATUS.PENDING,
    placements: [],
    conditions: [],
  });
}

function isKubernetesNotFoundError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 404
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
  const appsDir = getAppsDir();
  return path.join(appsDir, appName);
}

function getDraftsDir() {
  return path.join(getAppsDir(), '.drafts');
}

function getDraftDir(draftId: string) {
  return path.join(getDraftsDir(), draftId);
}

function getBundleDir(appBundle: AppBundleSchema) {
  return appBundle.draftId
    ? getDraftDir(appBundle.draftId)
    : getAppDir(appBundle.app.metadata.name);
}

export async function reconcileFluxGitRepository({
  name,
  namespace,
}: {
  namespace: string;
  name: string;
}): Promise<void> {
  const patch = [
    {
      op: 'add',
      path: '/metadata/annotations',
      value: {
        'reconcile.fluxcd.io/requestedAt': new Date().toISOString(),
      },
    },
  ];

  try {
    await k.customObjectsApi().patchNamespacedCustomObject({
      namespace,
      group: 'source.toolkit.fluxcd.io',
      version: 'v1',
      plural: 'gitrepositories',
      name,
      body: patch,
    });

    applicationsLogger.info(
      { name, namespace, operation: 'reconcile-flux-git-repository' },
      'Triggered reconciliation for GitRepository',
    );
  } catch (err) {
    applicationsLogger.error(
      { err, name, namespace, operation: 'reconcile-flux-git-repository' },
      'Error triggering reconciliation',
    );
  }
}
