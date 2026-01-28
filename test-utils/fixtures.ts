import type { App } from '@/app/api/applications';
import { APP_STATUS } from '@/app/constants';
import {
  deploymentSchema,
  ingressSchema,
  kustomizationSchema,
  namespaceSchema,
  persistentVolumeClaimSchema,
  serviceSchema,
} from '@/app/api/schemas';
import z from 'zod';

export const baseApp: App = Object.freeze({
  link: 'apps/my-app',
  spec: {
    name: 'my-app',
    image: 'postgres:16',
    ports: [{ name: 'http', containerPort: 80 }],
    envVariables: [{ name: 'DB_NAME', value: 'production' }],
    resources: { limits: { cpu: '1000m', memory: '1Gi' } },
    ingress: { port: { name: 'http' } },
  },
  status: APP_STATUS.RUNNING,
  pods: [],
  iconUrl: 'https://cdn.simpleicons.org/my-app',
  deployment: {
    spec: { replicas: 1 },
    status: {
      availableReplicas: 1,
      replicas: 1,
      readyReplicas: 1,
      updatedReplicas: 1,
      conditions: [],
    },
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
    'deployment.yaml',
    'ingress.yaml',
    'service.yaml',
    'namespace.yaml',
  ],
};

export const baseKustomization = Object.freeze(baseKustomizationData);
