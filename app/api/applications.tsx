import "server-only";
import fs from "fs";
import YAML from "yaml";
import * as z from "zod";
import { getAppConfig } from "../(dashboard)/apps/config";
import path from "path";
import { AppFormSchema } from "../(dashboard)/apps/formSchema";
import * as _ from "lodash";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import {
  APP_STATUS,
  deploymentSchema,
  ingressSchema,
  kustomizationSchema,
} from "./schemas";
import * as k from "./k8s";

export async function getApps() {
  const appDir = getAppsDir();
  const entries = await fs.promises.readdir(appDir, { withFileTypes: true });
  const appListPromises = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => getAppByName(entry.name));

  return Promise.all(appListPromises);
}

export async function restartApp(name: string) {
  const patch = [
    {
      op: "replace",
      path: "/spec/template/metadata/annotations",
      value: {
        "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
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
  const appPath = getAppDir(name);

  const kustomizationFile = await fs.promises.readFile(
    `${appPath}/kustomization.yaml`,
    "utf-8",
  );
  const ingressFile = await fs.promises.readFile(
    `${appPath}/ingress.yaml`,
    "utf-8",
  );

  const kustomizationData = kustomizationSchema.parse(
    YAML.parse(kustomizationFile),
  );

  const deployment = await getFile({
    path: `${appPath}/deployment.yaml`,
    schema: deploymentSchema,
  });

  const ingressData = ingressSchema.parse(YAML.parse(ingressFile));

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

  const appName = kustomizationData.namespace;

  return {
    name: appName,
    spec: {
      name: appName,
      image: deployment.data.spec.template.spec.containers[0].image,
      envVariables: deployment.data.spec.template.spec.containers[0].env.map(
        (env) => ({
          name: env.name,
          value: env.value,
        }),
      ),
    } satisfies AppFormSchema,
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
    link: `http://${ingressData.spec.rules[0].host}`,
  };
}

export async function updateApp(spec: AppFormSchema) {
  const appDir = getAppDir(spec.name);

  const deploymentFilePath = `${appDir}/deployment.yaml`;

  const newPartialDeployment = adaptAppToResources(spec).deployment;

  const previousDeployment = await getFile({
    path: deploymentFilePath,
    schema: deploymentSchema,
  });

  const updatedDeployment = _.merge(
    previousDeployment.raw,
    newPartialDeployment,
  );

  await fs.promises.writeFile(
    deploymentFilePath,
    YAML.stringify(updatedDeployment),
  );

  await git.add({
    fs,
    dir: getAppConfig().PROJECT_DIR,
    filepath: path.relative(getAppConfig().PROJECT_DIR, appDir),
  });

  await git.commit({
    fs,
    dir: getAppConfig().PROJECT_DIR,
    message: `Update app ${spec.name}`,
    author: {
      name: getAppConfig().USER_NAME,
      email: getAppConfig().USER_EMAIL,
    },
  });

  await git.push({
    fs,
    http,
    dir: getAppConfig().PROJECT_DIR,
    remote: "origin",
    ref: "main",
    onAuth: () => ({ username: getAppConfig().GITHUB_TOKEN }),
  });

  await reconcileFluxGitRepository({
    name: "flux-system",
    namespace: "flux-system",
  });

  return { success: true };
}

function adaptAppToResources(app: AppFormSchema) {
  const deployment = {
    metadata: {
      name: app.name,
    },

    spec: {
      selector: {
        matchLabels: {
          app: app.name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: app.name,
          },
        },
        spec: {
          containers: [
            {
              name: app.name,
              image: app.image,
              env: app.envVariables.map((env) => ({
                name: env.name,
                value: env.value,
              })),
            },
          ],
        },
      },
    },
  } satisfies Partial<z.infer<typeof deploymentSchema>>;

  return {
    deployment,
  };
}

export type App = Awaited<ReturnType<typeof getAppByName>>;

async function getFile<T>({
  path,
  schema,
}: {
  path: string;
  schema: z.ZodType<T>;
}): Promise<{ data: T; raw: unknown }> {
  const fileText = await fs.promises.readFile(path, "utf-8");

  const raw = YAML.parse(fileText);
  return { data: schema.parse(raw), raw };
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
    "clusters",
    config.CLUSTER_NAME,
    "my-applications",
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
      op: "add",
      path: "/metadata/annotations",
      value: {
        "reconcile.fluxcd.io/requestedAt": new Date().toISOString(),
      },
    },
  ];

  try {
    await k.customObjectsApi().patchNamespacedCustomObject({
      namespace,
      group: "source.toolkit.fluxcd.io",
      version: "v1",
      plural: "gitrepositories",
      name,
      body: patch,
    });

    console.log(
      `Successfully triggered reconciliation for GitRepository '${name}' in namespace '${namespace}'.`,
    );
  } catch (err) {
    console.error("Error triggering reconciliation:", err);
  }
}
