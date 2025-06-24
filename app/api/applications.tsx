import fs from "fs";
import YAML from "yaml";
import * as z from "zod";
import * as k8s from "@kubernetes/client-node";
import { getAppConfig } from "../(dashboard)/apps/config";
import path from "path";
import { AppFormSchema } from "../(dashboard)/apps/formSchema";
import * as _ from "lodash";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

export async function getApps() {
  const appDir = getAppsDir();
  const entries = await fs.promises.readdir(appDir, { withFileTypes: true });
  const appListPromises = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => getAppByName(entry.name));

  return Promise.all(appListPromises);
}

const kustomizationSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal("Kustomization"),
  metadata: z.object({
    name: z.string(),
  }),
  namespace: z.string(),
  resources: z.array(z.string()),
});

const ingressSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal("Ingress"),
  metadata: z.object({
    name: z.string(),
    annotations: z.record(z.string(), z.string()),
  }),
  spec: z.object({
    rules: z.array(
      z.object({
        host: z.string(),
        http: z.object({
          paths: z.array(
            z.object({
              path: z.string(),
              pathType: z.literal("Prefix"),
              backend: z.object({
                service: z.object({
                  name: z.string(),
                  port: z.object({
                    number: z.number(),
                  }),
                }),
              }),
            })
          ),
        }),
      })
    ),
  }),
});

const deploymentSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal("Deployment"),
  metadata: z.object({
    name: z.string(),
  }),
  spec: z.object({
    template: z.object({
      spec: z.object({
        containers: z.array(
          z.object({
            name: z.string(),
            image: z.string(),
            env: z.array(
              z.object({
                name: z.string(),
                value: z.string(),
              })
            ),
          })
        ),
      }),
    }),
  }),
});

export const APP_STATUS = {
  RUNNING: "Running",
  UNKNOWN: "Unknown",
} as const;

export type AppStatus = (typeof APP_STATUS)[keyof typeof APP_STATUS];

async function getAppByName(name: string) {
  const appPath = getAppDir(name);

  const kustomizationFile = await fs.promises.readFile(
    `${appPath}/kustomization.yaml`,
    "utf-8"
  );
  const ingressFile = await fs.promises.readFile(
    `${appPath}/ingress.yaml`,
    "utf-8"
  );

  const kustomizationData = kustomizationSchema.parse(
    YAML.parse(kustomizationFile)
  );

  const deployment = await getFile({
    path: `${appPath}/deployment.yaml`,
    schema: deploymentSchema,
  });

  const ingressData = ingressSchema.parse(YAML.parse(ingressFile));

  const podsRes = await k8sApi.listNamespacedPod({ namespace: "podinfo2" });

  const pods = podsRes.items.map((pod) => ({
    name: pod.metadata?.name,
    status: pod.status?.phase,
  }));

  return {
    spec: {
      name: kustomizationData.namespace,
      image: deployment.data.spec.template.spec.containers[0].image,
      envVariables: deployment.data.spec.template.spec.containers[0].env.map(
        (env) => ({
          name: env.name,
          value: env.value,
        })
      ),
    } satisfies AppFormSchema,
    pods,
    status: getAggregatedStatus(
      pods.map((pod) => pod.status || APP_STATUS.UNKNOWN)
    ),
    link: `http://${ingressData.spec.rules[0].host}`,
  };
}

export async function updateApp(spec: AppFormSchema) {
  const appDir = getAppDir(spec.name);

  const deploymentFilePath = `${appDir}/deployment.yaml`;

  const adaptedDeployment = adaptAppToResources(spec).deployment;

  const deployment = await getFile({
    path: deploymentFilePath,
    schema: deploymentSchema,
  });

  const updatedDeployment = _.merge(deployment.raw, adaptedDeployment);

  await fs.promises.writeFile(
    deploymentFilePath,
    YAML.stringify(updatedDeployment)
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

  return { success: true };
}

function adaptAppToResources(app: AppFormSchema) {
  const deployment = {
    spec: {
      template: {
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

export function getAggregatedStatus(statuses: string[]) {
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
    "my-applications"
  );
}

function getAppDir(appName: string) {
  const appsDir = getAppsDir();
  return path.join(appsDir, appName);
}
