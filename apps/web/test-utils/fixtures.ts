import type { PublishedAppBundle } from '@/app/api/applications';
import { APP_STATUS } from '@/app/constants';
import {
  appBundleSchema,
  appSchema,
  deploymentSchema,
  ingressSchema,
  kustomizationSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
  serviceSchema,
} from '@/app/api/schemas';
import z from 'zod';

export const baseAppManifest: z.infer<typeof appSchema> = Object.freeze({
  apiVersion: 'tesselar.io/v1alpha1',
  kind: 'App',
  metadata: {
    name: 'my-app',
  },
  spec: {
    image: 'postgres:16',
    ports: [{ name: 'http', containerPort: 80 }],
    envVariables: [{ name: 'DB_NAME', value: 'production' }],
    resources: { limits: { cpu: '1000m', memory: '1Gi' } },
    ingress: { port: { name: 'http' } },
  },
});

export const baseAppBundle: z.infer<typeof appBundleSchema> = Object.freeze({
  app: baseAppManifest,
  additionalResources: [],
});

export const basePersistedAppManifest: z.infer<typeof appSchema> = Object.freeze({
  ...baseAppManifest,
});

export const baseApp: PublishedAppBundle = Object.freeze({
  ...baseAppBundle,
  status: {
    phase: APP_STATUS.RUNNING,
    placements: [],
    conditions: [],
  },
});

export const baseDeployment: z.infer<typeof deploymentSchema> = Object.freeze({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: {
    name: 'test-app',
  },
  spec: {
    selector: {
      matchLabels: {
        app: 'test-app',
      },
    },
    template: {
      metadata: {
        labels: {
          app: 'test-app',
        },
      },
      spec: {
        containers: [
          {
            name: 'test-app',
            image: 'old-image:1.0',
            ports: [{ name: 'http', containerPort: 80 }],
            env: [],
            resources: {
              limits: {
                cpu: '500m',
                memory: '512Mi',
              },
            },
          },
        ],
      },
    },
  },
});

export const basePersistentVolumeClaim: z.infer<
  typeof persistentVolumeClaimSchema
> = Object.freeze({
  apiVersion: 'v1' as const,
  kind: 'PersistentVolumeClaim',
  metadata: { name: 'data' },
  spec: {
    accessModes: ['ReadWriteOnce'],
    storageClassName: 'longhorn' as const,
    resources: {
      requests: {
        storage: '1Gi',
      },
    },
  },
});

export const baseService: z.infer<typeof serviceSchema> = Object.freeze({
  apiVersion: 'v1',
  kind: 'Service',
  metadata: {
    name: 'test-app',
  },
  spec: {
    type: 'ClusterIP',
    selector: {
      app: 'test-app',
    },
    ports: [
      {
        name: 'http',
        port: 80,
        protocol: 'TCP',
        targetPort: 'http',
      },
    ],
  },
});

const baseIngressData: z.infer<typeof ingressSchema> = {
  apiVersion: 'networking.k8s.io/v1',
  kind: 'Ingress',
  metadata: {
    name: 'test-app',
    annotations: {},
  },
  spec: {
    rules: [
      {
        host: 'test-app.${DOMAIN}',
        http: {
          paths: [
            {
              path: '/',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: 'test-app',
                  port: { name: 'http' },
                },
              },
            },
          ],
        },
      },
    ],
  },
};

export const baseIngress = Object.freeze(baseIngressData);

export const baseNamespace: z.infer<typeof namespaceSchema> = Object.freeze({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: 'test-app',
    labels: {
      name: 'test-app',
    },
  },
});

const baseKustomizationData: z.infer<typeof kustomizationSchema> = {
  apiVersion: 'kustomize.config.k8s.io/v1beta1',
  kind: 'Kustomization',
  metadata: {
    name: 'test-app',
  },
  namespace: 'test-app',
  resources: [
    'app.yaml',
    'deployment.yaml',
    'ingress.yaml',
    'service.yaml',
    'namespace.yaml',
  ],
};

export const baseKustomization = Object.freeze(baseKustomizationData);
