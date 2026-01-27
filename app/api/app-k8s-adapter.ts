import * as z from 'zod';

import { AppSchema } from './schemas';
import {
  deploymentSchema,
  ingressSchema,
  namespaceSchema,
  serviceSchema,
} from './schemas';

/**
 * Generates Kubernetes manifests (Deployment, Ingress, Kustomization, etc.)
 * from the base app schema.
 */
export function toManifests(app: AppSchema) {
  const deployment: z.infer<typeof deploymentSchema> = {
    apiVersion: 'apps/v1',
    kind: 'Deployment' as const,
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
              ports: app.ports.map((port) => ({
                name: port.name,
                containerPort: port.containerPort,
              })),
              env: app.envVariables,
              resources: app.resources,
              volumeMounts: app.volumeMounts,
            },
          ],

          volumes: deriveVolumesFromMounts(app.volumeMounts),
        },
      },
    },
  };

  const ingress: z.infer<typeof ingressSchema> = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress' as const,
    metadata: {
      name: app.name,
      annotations: {},
    },
    spec: {
      rules: [
        {
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix' as const,
                backend: {
                  service: {
                    name: app.name,
                    port: { name: app.ingress.port.name },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const service: z.infer<typeof serviceSchema> = {
    apiVersion: 'v1',
    kind: 'Service' as const,
    metadata: {
      name: app.name,
    },
    spec: {
      type: 'ClusterIP',
      selector: {
        app: app.name,
      },
      ports: app.ports.map((port) => ({
        name: port.name,
        port: port.containerPort,
        protocol: 'TCP',
        targetPort: port.name,
      })),
    },
  };

  const namespace: z.infer<typeof namespaceSchema> = {
    apiVersion: 'v1',
    kind: 'Namespace' as const,
    metadata: {
      name: app.name,
      labels: {
        name: app.name,
      },
    },
  };

  return {
    deployment,
    ingress,
    service,
    namespace,
    additionalResources: app.additionalResources ?? [],
  };
}

export type AppManifests = ReturnType<typeof toManifests>;

/**
 * Builds the base app schema from Kubernetes manifests.
 */
export function fromManifests({
  deployment,
  ingress,
  additionalResources = [],
}: AppManifests): AppSchema {
  const container = deployment.spec.template.spec.containers[0];
  const appName = deployment.metadata.name;
  const ingressPortName =
    ingress.spec.rules[0]?.http?.paths[0]?.backend?.service?.port?.name;

  const app: AppSchema = {
    name: appName,
    image: container.image,
    ports: container.ports,
    envVariables: container.env || [],
    resources: container.resources,
    ingress: { port: { name: ingressPortName } },
    additionalResources: additionalResources,
    volumeMounts: container.volumeMounts,
  };

  return app;
}

function deriveVolumesFromMounts(volumeMounts: AppSchema['volumeMounts']) {
  if (!volumeMounts) {
    return;
  }

  const claimNameSet = new Set(
    volumeMounts.map((volumeMount) => volumeMount.name),
  );

  return Array.from(claimNameSet).map((volumeMountName) => ({
    name: volumeMountName,
    persistentVolumeClaim: {
      claimName: volumeMountName,
    },
  }));
}
