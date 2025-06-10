import fs from "fs";
import YAML from "yaml";
import * as z from "zod";

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
    namespace: z.string(),
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

  return {
    name: kustomizationData.namespace,
    link: `http://${ingressData.spec.rules[0].host}`,
  };
}
