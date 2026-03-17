import fs from 'fs';
import YAML from 'yaml';
import * as z from 'zod';
import { getAppConfig } from '../(dashboard)/apps/config';
import path from 'path';
import { AppBundleSchema, appBundleSchema } from './schemas';
import merge from 'lodash/merge';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { APP_STATUS, type AppStatus } from '@/app/constants';
import {
  appSchema,
  authClientSchema,
  deploymentSchema,
  ingressSchema,
  kustomizationSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
  serviceSchema,
} from './schemas';
import * as k from './k8s';
import { fromManifests, toBundleManifests } from './app-k8s-adapter';

export type AppResourceType =
  | z.infer<typeof appSchema>
  | z.infer<typeof authClientSchema>
  | z.infer<typeof deploymentSchema>
  | z.infer<typeof ingressSchema>
  | z.infer<typeof kustomizationSchema>
  | z.infer<typeof persistentVolumeClaimSchema>
  | z.infer<typeof serviceSchema>
  | z.infer<typeof namespaceSchema>;

type AdditionalResourceSchema =
  | z.infer<typeof authClientSchema>
  | z.infer<typeof persistentVolumeClaimSchema>;

const FLUX_IGNORE_SSA_ANNOTATION = 'kustomize.toolkit.fluxcd.io/ssa';
const FLUX_IGNORE_SSA_VALUE = 'Ignore';

export type AppRuntimeStatus = {
  phase: AppStatus;
  pods: Array<{
    name: string | undefined;
    metadata: {
      creationTimestamp: Date | undefined;
    };
    spec: {
      nodeName: string | undefined;
    };
    status: {
      phase: string | undefined;
      startTime: Date | undefined;
      message: string | undefined;
      reason: string | undefined;
      conditions:
        | Array<{
            type: string;
            status: string;
            lastProbeTime: Date | undefined;
            lastTransitionTime: Date | undefined;
            reason: string | undefined;
            message: string | undefined;
          }>
        | undefined;
    };
  }>;
  deployment: {
    spec: {
      replicas: number | undefined;
    };
    status: {
      availableReplicas: number | undefined;
      replicas: number | undefined;
      readyReplicas: number | undefined;
      updatedReplicas: number | undefined;
      conditions:
        | Array<{
            type: string;
            status: string;
            lastTransitionTime: Date | undefined;
            reason: string | undefined;
            message: string | undefined;
          }>
        | undefined;
    };
  };
};

export type App = AppBundleSchema & {
  status: AppRuntimeStatus;
};

export async function getApps() {
  const appDir = getAppsDir();
  const entries = await fs.promises.readdir(appDir, {
    withFileTypes: true,
  });
  const appListPromises = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => getAppByName(entry.name));

  const settled = await Promise.allSettled(appListPromises);

  settled.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Error fetching app:', result.reason);
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

  const [deploymentRes, podsRes] = await Promise.all([
    k.appsApi().readNamespacedDeployment({ name, namespace: name }),
    k.coreApi().listNamespacedPod({ namespace: name }),
  ]);

  const desiredReplicas = deploymentRes?.spec?.replicas || 0;
  const replicas = deploymentRes?.status?.replicas || 0;
  const updatedReplicas = deploymentRes?.status?.updatedReplicas || 0;

  const deploymentPending =
    updatedReplicas !== desiredReplicas || replicas !== desiredReplicas;

  const pods = podsRes.items.map((pod) => {
    return {
      name: pod.metadata?.name,
      metadata: {
        creationTimestamp: pod.metadata?.creationTimestamp,
      },
      spec: {
        nodeName: pod.spec?.nodeName,
      },
      status: {
        phase: pod.status?.phase,
        startTime: pod.status?.startTime,
        message: pod.status?.message,
        reason: pod.status?.reason,
        conditions: pod.status?.conditions?.map((condition) => ({
          type: condition.type,
          status: condition.status,
          lastProbeTime: condition.lastProbeTime,
          lastTransitionTime: condition.lastTransitionTime,
          reason: condition.reason,
          message: condition.message,
        })),
      },
    };
  });

  const appStatus = deploymentPending
    ? APP_STATUS.PENDING
    : getPodsAggregatedStatus(
        pods.map((pod) => pod.status?.phase || APP_STATUS.UNKNOWN),
      );

  return {
    app,
    additionalResources,
    status: {
      phase: appStatus,
      pods,
      deployment: {
        spec: {
          replicas: deploymentRes.spec?.replicas,
        },

        status: {
          availableReplicas: deploymentRes.status?.availableReplicas,
          replicas: deploymentRes.status?.replicas,
          readyReplicas: deploymentRes.status?.readyReplicas,
          updatedReplicas: deploymentRes.status?.updatedReplicas,
          conditions: deploymentRes.status?.conditions?.map((condition) => ({
            type: condition.type,
            status: condition.status,
            lastTransitionTime: condition.lastTransitionTime,
            reason: condition.reason,
            message: condition.message,
          })),
        },
      },
    },
  } satisfies App;
}

export async function updateApp(appBundle: AppBundleSchema) {
  const parsedAppBundle = appBundleSchema.parse(appBundle);
  const appName = parsedAppBundle.app.metadata.name;

  try {
    const appDir = getAppDir(appName);
    const deploymentFilePath = `${appDir}/deployment.yaml`;
    const appManifest = createPersistedAppManifest(parsedAppBundle.app);

    const {
      deployment: nextDeployment,
      ingress,
      service,
      namespace,
      additionalResources,
    } = toBundleManifests({
      ...parsedAppBundle,
      app: appManifest,
    });

    const previousDeployment = await getFile({
      path: deploymentFilePath,
      schema: deploymentSchema,
    });

    const updatedDeployment = merge({}, previousDeployment.raw, nextDeployment);

    const deployment = {
      ...updatedDeployment,
    } satisfies z.infer<typeof deploymentSchema>;

    await writeResourcesToFileSystem(appName, [
      appManifest,
      namespace,
      deployment,
      service,
      ingress,
      ...additionalResources,
    ]);

    await commitAndPushChanges(appName, `Update app ${appName}`);

    return { success: true };
  } catch (error) {
    console.error(`[updateApp] Failed to update app "${appName}"`, error);
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

  if (
    resource.kind === 'Deployment' ||
    resource.kind === 'Ingress' ||
    resource.kind === 'Kustomization' ||
    resource.kind === 'Service' ||
    resource.kind === 'Namespace'
  ) {
    return `${resource.kind.toLowerCase()}.yaml`;
  }

  return `${resource.metadata.name}.${resource.kind.toLowerCase()}.yaml`;
}

async function writeResourcesToFileSystem(
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

  await Promise.all(
    allFiles.map(async (resource) => {
      const appDir = getAppDir(appName);
      const filePath = `${appDir}/${resource.filename}`;

      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(filePath, resource.textContent);
    }),
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
  const appManifest = createPersistedAppManifest(parsedAppBundle.app);
  const { deployment, ingress, service, namespace, additionalResources } =
    toBundleManifests({
      ...parsedAppBundle,
      app: appManifest,
    });

  await writeResourcesToFileSystem(parsedAppBundle.app.metadata.name, [
    appManifest,
    namespace,
    deployment,
    service,
    ingress,
    ...additionalResources,
  ]);

  await commitAndPushChanges(
    parsedAppBundle.app.metadata.name,
    `Create app ${parsedAppBundle.app.metadata.name}`,
  );

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

async function fileExists(filePath: string) {
  try {
    await fs.promises.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getManifestsFromAppFiles(appName: string): Promise<{
  app: z.infer<typeof appSchema>;
  deployment: z.infer<typeof deploymentSchema>;
  service: z.infer<typeof serviceSchema>;
  ingress: z.infer<typeof ingressSchema>;
  namespace: z.infer<typeof namespaceSchema>;
  additionalResources: AdditionalResourceSchema[];
}> {
  const appPath = getAppDir(appName);
  const requiredFiles = new Set([
    'app.yaml',
    'deployment.yaml',
    'ingress.yaml',
    'service.yaml',
    'namespace.yaml',
  ]);

  const kustomizationResult = await getFile({
    path: `${appPath}/kustomization.yaml`,
    schema: kustomizationSchema,
  });

  const kustomizationResources = new Set(kustomizationResult.data.resources);

  const additionalResourcesFileNames =
    kustomizationResources.difference(requiredFiles);

  const [
    appResult,
    deploymentResult,
    serviceResult,
    ingressResult,
    namespaceResult,
  ] = await Promise.all([
    getCanonicalApp(appPath),
    getFile({
      path: `${appPath}/deployment.yaml`,
      schema: deploymentSchema,
    }),
    getFile({
      path: `${appPath}/service.yaml`,
      schema: serviceSchema,
    }),
    getFile({
      path: `${appPath}/ingress.yaml`,
      schema: ingressSchema,
    }),
    getFile({
      path: `${appPath}/namespace.yaml`,
      schema: namespaceSchema,
    }),
  ]);

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
    deployment: deploymentResult.data,
    service: serviceResult.data,
    ingress: ingressResult.data,
    namespace: namespaceResult.data,
    additionalResources: additionalResources.filter(
      (resource) => resource !== undefined,
    ),
  };
}

async function getCanonicalApp(
  appPath: string,
): Promise<z.infer<typeof appSchema>> {
  const appFilePath = `${appPath}/app.yaml`;

  if (await fileExists(appFilePath)) {
    const { data } = await getFile({
      path: appFilePath,
      schema: appSchema,
    });

    return data;
  }

  const [deploymentResult, ingressResult, serviceResult, namespaceResult] =
    await Promise.all([
      getFile({
        path: `${appPath}/deployment.yaml`,
        schema: deploymentSchema,
      }),
      getFile({
        path: `${appPath}/ingress.yaml`,
        schema: ingressSchema,
      }),
      getFile({
        path: `${appPath}/service.yaml`,
        schema: serviceSchema,
      }),
      getFile({
        path: `${appPath}/namespace.yaml`,
        schema: namespaceSchema,
      }),
    ]);

  return fromManifests({
    deployment: deploymentResult.data,
    ingress: ingressResult.data,
    service: serviceResult.data,
    namespace: namespaceResult.data,
    additionalResources: [],
  }).app;
}

function createPersistedAppManifest(
  app: z.infer<typeof appSchema>,
): z.infer<typeof appSchema> {
  return {
    ...app,
    metadata: {
      ...app.metadata,
      annotations: {
        ...app.metadata.annotations,
        [FLUX_IGNORE_SSA_ANNOTATION]: FLUX_IGNORE_SSA_VALUE,
      },
    },
  };
}

export function getPodsAggregatedStatus(statuses: string[]) {
  const running = statuses.every((status) => status === APP_STATUS.RUNNING);
  if (running) {
    return APP_STATUS.RUNNING;
  }

  return APP_STATUS.UNKNOWN;
}

function getAppsDir() {
  const config = getAppConfig();
  return path.join(
    config.PROJECT_DIR,
    'clusters',
    config.CLUSTER_NAME,
    'my-applications',
  );
}

function getAppDir(appName: string) {
  const appsDir = getAppsDir();
  return path.join(appsDir, appName);
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

    console.log(
      `Successfully triggered reconciliation for GitRepository '${name}' in namespace '${namespace}'.`,
    );
  } catch (err) {
    console.error('Error triggering reconciliation:', err);
  }
}
