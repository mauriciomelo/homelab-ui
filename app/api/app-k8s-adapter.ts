import * as z from 'zod';

import { AppSchema } from './schemas';
import {
  deploymentSchema,
  ingressSchema,
  kustomizationSchema,
} from './schemas';

/**
 * Generates Kubernetes manifests (Deployment, Ingress, Kustomization, etc.)
 * from the base app schema.
 */
export function toManifests(app: AppSchema) {
  const deployment = {
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
              env: app.envVariables.map((env) => ({
                name: env.name,
                value: env.value,
              })),
              resources: app.resources,
            },
          ],
        },
      },
    },
  } satisfies z.infer<typeof deploymentSchema>;

  const ingress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress' as const,
    metadata: {
      name: app.name,
      annotations: {},
    },
    spec: {
      rules: [
        {
          host: `${app.name}.local`,
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
  } satisfies z.infer<typeof ingressSchema>;

  const kustomization = {
    apiVersion: 'kustomize.config.k8s.io/v1beta1',
    kind: 'Kustomization' as const,
    metadata: { name: app.name },
    namespace: app.name,
    resources: ['deployment.yaml', 'ingress.yaml'],
  } satisfies z.infer<typeof kustomizationSchema>;

  return {
    deployment,
    ingress,
    kustomization,
  };
}
