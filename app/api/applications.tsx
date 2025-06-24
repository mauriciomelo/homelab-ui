import fs from "fs";
import YAML from "yaml";
import * as z from "zod";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

export async function getApps(projectDir: string) {
  const appDir = projectDir + "/clusters/homelab/my-applications";
  const entries = await fs.promises.readdir(appDir, { withFileTypes: true });
  const appListPromises = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => getApp({ appDir, appName: entry.name }));

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

export const APP_STATUS = {
  RUNNING: "Running",
  UNKNOWN: "Unknown",
} as const;

export type AppStatus = (typeof APP_STATUS)[keyof typeof APP_STATUS];

async function getApp({
  appDir,
  appName,
}: {
  appDir: string;
  appName: string;
}) {
  const appPath = `${appDir}/${appName}`;

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

  const ingressData = ingressSchema.parse(YAML.parse(ingressFile));

  const podsRes = await k8sApi.listNamespacedPod({ namespace: "podinfo2" });

  const pods = podsRes.items.map((pod) => ({
    name: pod.metadata?.name,
    status: pod.status?.phase,
  }));

  return {
    name: kustomizationData.namespace,
    pods,
    status: getAggregatedStatus(
      pods.map((pod) => pod.status || APP_STATUS.UNKNOWN)
    ),
    link: `http://${ingressData.spec.rules[0].host}`,
  };
}

export function getAggregatedStatus(statuses: string[]) {
  const running = statuses.every((status) => status === APP_STATUS.RUNNING);
  if (running) {
    return APP_STATUS.RUNNING;
  }

  return APP_STATUS.UNKNOWN;
}
