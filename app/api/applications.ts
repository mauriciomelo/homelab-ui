import 'server-only';
import fs from 'fs';
import YAML from 'yaml';
import * as z from 'zod';
import { getAppConfig } from '../(dashboard)/apps/config';
import path from 'path';
import { AppSchema, appSchema } from './schemas';
import * as _ from 'lodash';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { APP_STATUS } from '@/app/constants';
import {
  authClientSchema,
  deploymentSchema,
  ingressSchema,
  kustomizationSchema,
  persistentVolumeClaimSchema,
  traefikConfigSchema,
  traefikValuesContentSchema,
} from './schemas';
import * as k from './k8s';
import { AppManifests, fromManifests, toManifests } from './app-k8s-adapter';

export type AppResourceType =
  | z.infer<typeof authClientSchema>
  | z.infer<typeof deploymentSchema>
  | z.infer<typeof ingressSchema>
  | z.infer<typeof kustomizationSchema>
  | z.infer<typeof persistentVolumeClaimSchema>;

type AdditionalResourceSchema =
  | z.infer<typeof authClientSchema>
  | z.infer<typeof persistentVolumeClaimSchema>;

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
  const { ingress, deployment, additionalResources } =
    await getManifestsFromAppFiles(name);

  const { host } = await getClusterConfig();

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

  const spec = fromManifests({
    deployment: deployment,
    ingress: ingress,
    additionalResources: additionalResources,
  });
  const appName = spec.name;
  const appHost = resolveAppHost(appName, host);
  return {
    spec,
    pods,
    iconUrl: `https://cdn.simpleicons.org/${appName}`,
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
    status: appStatus,
    link: `https://${appHost}`,
  };
}

export async function updateApp(app: AppSchema) {
  const parsedApp = appSchema.parse(app);
  const appDir = getAppDir(parsedApp.name);
  const deploymentFilePath = `${appDir}/deployment.yaml`;

  const { deployment: nextDeployment } = toManifests(parsedApp);

  const previousDeployment = await getFile({
    path: deploymentFilePath,
    schema: deploymentSchema,
  });

  const updatedDeployment = _.merge(previousDeployment.raw, nextDeployment);

  const deployment = {
    ...updatedDeployment,
  } satisfies z.infer<typeof deploymentSchema>;

  await writeResourcesToFileSystem(parsedApp.name, [deployment]);

  await commitAndPushChanges(parsedApp.name, `Update app ${parsedApp.name}`);

  return { success: true };
}

export type App = Awaited<ReturnType<typeof getAppByName>>;

function getFileName(resource: AppResourceType) {
  if (
    resource.kind === 'Deployment' ||
    resource.kind === 'Ingress' ||
    resource.kind === 'Kustomization'
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

export async function createApp(app: AppSchema) {
  const parsedApp = appSchema.parse(app);
  const { deployment, ingress, additionalResources } = toManifests(parsedApp);

  await writeResourcesToFileSystem(parsedApp.name, [
    deployment,
    ingress,
    ...additionalResources,
  ]);

  await commitAndPushChanges(parsedApp.name, `Create app ${parsedApp.name}`);

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

  const raw = YAML.parse(fileText.toString());
  return { data: schema.parse(raw), raw };
}

async function getClusterConfig(): Promise<{ host: string }> {
  const config = getAppConfig();
  const traefikConfigPath = path.join(
    config.PROJECT_DIR,
    'clusters',
    config.CLUSTER_NAME,
    'tesselar-system',
    'traefik',
    'traefik-config.yaml',
  );
  const { data } = await getFile({
    path: traefikConfigPath,
    schema: traefikConfigSchema,
  });
  const values = traefikValuesContentSchema.parse(
    YAML.parse(data.spec.valuesContent),
  );
  const defaultRule = values.providers.kubernetesIngress.defaultRule;
  const hostMatch = defaultRule.match(/Host\(`([^`]+)`\)/);

  if (!hostMatch) {
    throw new Error(`Unable to parse Traefik defaultRule: ${defaultRule}`);
  }

  const host = hostMatch[1]
    .replace(/{{\s*\.Name\s*}}/g, '')
    .replace(/^\./, '');

  return { host };
}

function resolveAppHost(appName: string, host: string) {
  return `${appName}.${host}`;
}

async function getManifestsFromAppFiles(
  appName: string,
): Promise<AppManifests> {
  const appPath = getAppDir(appName);
  const requiredFiles = new Set(['deployment.yaml', 'ingress.yaml']);

  const kustomizationResult = await getFile({
    path: `${appPath}/kustomization.yaml`,
    schema: kustomizationSchema,
  });

  const kustomizationResources = new Set(kustomizationResult.data.resources);

  const additionalResourcesFileNames =
    kustomizationResources.difference(requiredFiles);

  const deploymentResult = await getFile({
    path: `${appPath}/deployment.yaml`,
    schema: deploymentSchema,
  });

  const ingressResult = await getFile({
    path: `${appPath}/ingress.yaml`,
    schema: ingressSchema,
  });

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
    deployment: deploymentResult.data,
    ingress: ingressResult.data,
    additionalResources: additionalResources.filter(
      (resource) => resource !== undefined,
    ),
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
