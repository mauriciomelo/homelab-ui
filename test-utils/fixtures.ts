import type { App } from '@/app/api/applications';
import { APP_STATUS, deploymentSchema } from '@/app/api/schemas';
import z from 'zod';

export const baseApp: App = Object.freeze({
  link: 'apps/my-app',
  spec: {
    name: 'my-app',
    image: 'postgres:16',
    envVariables: [{ name: 'DB_NAME', value: 'production' }],
    resources: { limits: { cpu: '1000m', memory: '1Gi' } },
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
