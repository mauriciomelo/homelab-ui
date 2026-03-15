import * as z from 'zod';

import { AdditionalResourceSchema, AppBundleSchema, AppSchema } from './schemas';
import {
  deploymentSchema,
  ingressSchema,
  namespaceSchema,
  serviceSchema,
} from './schemas';

type HealthCheck = NonNullable<AppSchema['spec']['health']>['check'];

const HEALTH_DEFAULTS = {
  startup: {
    initialDelaySeconds: 5,
    periodSeconds: 5,
    timeoutSeconds: 2,
    failureThreshold: 60,
  },
  readiness: {
    periodSeconds: 10,
    timeoutSeconds: 2,
    successThreshold: 1,
    failureThreshold: 3,
  },
  liveness: {
    periodSeconds: 10,
    timeoutSeconds: 2,
    successThreshold: 1,
    failureThreshold: 3,
  },
};

/**
 * Generates Kubernetes manifests (Deployment, Ingress, Kustomization, etc.)
 * from the base app schema.
 */
export type AppManifests = {
  deployment: z.infer<typeof deploymentSchema>;
  ingress: z.infer<typeof ingressSchema>;
  service: z.infer<typeof serviceSchema>;
  namespace: z.infer<typeof namespaceSchema>;
  additionalResources: AdditionalResourceSchema[];
};

export function toManifests(app: AppSchema): AppManifests {
  const healthProbes = app.spec.health
    ? buildHealthProbes(app.spec.health.check)
    : {};
  const deployment: z.infer<typeof deploymentSchema> = {
    apiVersion: 'apps/v1',
    kind: 'Deployment' as const,
    metadata: {
      name: app.metadata.name,
    },
    spec: {
      strategy: {
        type: 'Recreate',
      },
      selector: {
        matchLabels: {
          app: app.metadata.name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: app.metadata.name,
          },
        },
        spec: {
          containers: [
            {
              name: app.metadata.name,
              image: app.spec.image,
              ports: app.spec.ports.map((port) => ({
                name: port.name,
                containerPort: port.containerPort,
              })),
              env: app.spec.envVariables,
              resources: app.spec.resources,
              volumeMounts: app.spec.volumeMounts,
              ...healthProbes,
            },
          ],

          volumes: deriveVolumesFromMounts(app.spec.volumeMounts),
        },
      },
    },
  };

  const ingress: z.infer<typeof ingressSchema> = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress' as const,
    metadata: {
      name: app.metadata.name,
      annotations: {},
    },
    spec: {
      rules: [
        {
          host: `${app.metadata.name}.\${DOMAIN}`,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix' as const,
                backend: {
                  service: {
                    name: app.metadata.name,
                    port: { name: app.spec.ingress.port.name },
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
      name: app.metadata.name,
    },
    spec: {
      type: 'ClusterIP',
      selector: {
        app: app.metadata.name,
      },
      ports: app.spec.ports.map((port) => ({
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
      name: app.metadata.name,
      labels: {
        name: app.metadata.name,
      },
    },
  };

  return {
    deployment,
    ingress,
    service,
    namespace,
    additionalResources: [],
  };
}

export function toBundleManifests({
  app,
  additionalResources,
}: AppBundleSchema): AppManifests {
  return {
    ...toManifests(app),
    additionalResources,
  };
}

/**
 * Builds the base app schema from Kubernetes manifests.
 */
export function fromManifests({
  deployment,
  ingress,
  additionalResources = [],
}: AppManifests): AppBundleSchema {
  const container = deployment.spec.template.spec.containers[0];
  const appName = deployment.metadata.name;
  const ingressPortName =
    ingress.spec.rules[0]?.http?.paths[0]?.backend?.service?.port?.name;
  const health = deriveHealth(container);

  const app: AppSchema = {
    apiVersion: 'tesselar.io/v1alpha1',
    kind: 'App',
    metadata: {
      name: appName,
    },
    spec: {
      image: container.image,
      ports: container.ports,
      envVariables: container.env || [],
      resources: container.resources,
      ingress: { port: { name: ingressPortName } },
      volumeMounts: container.volumeMounts,
      ...(health ? { health } : {}),
    },
  };

  return {
    app,
    additionalResources,
  };
}

function buildHealthProbes(check: HealthCheck) {
  return {
    startupProbe: {
      httpGet: { path: check.path, port: check.port },
      ...HEALTH_DEFAULTS.startup,
    },
    readinessProbe: {
      httpGet: { path: check.path, port: check.port },
      ...HEALTH_DEFAULTS.readiness,
    },
    livenessProbe: {
      httpGet: { path: check.path, port: check.port },
      ...HEALTH_DEFAULTS.liveness,
    },
  };
}

function deriveHealth(
  container: z.infer<
    typeof deploymentSchema
  >['spec']['template']['spec']['containers'][number],
) {
  const probe =
    container.startupProbe?.httpGet ??
    container.readinessProbe?.httpGet ??
    container.livenessProbe?.httpGet;

  if (!probe) {
    return undefined;
  }

  const check: HealthCheck = {
    type: 'httpGet',
    path: probe.path,
    port: probe.port,
  };

  return { check };
}

function deriveVolumesFromMounts(volumeMounts: AppSchema['spec']['volumeMounts']) {
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
