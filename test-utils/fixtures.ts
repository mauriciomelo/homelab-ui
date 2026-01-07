import type { App } from '@/app/api/applications';
import { APP_STATUS } from '@/app/api/schemas';

export const baseApp: App = Object.freeze({
  link: 'apps/my-app',
  spec: {
    name: 'my-app',
    image: 'postgres:16',
    envVariables: [{ name: 'DB_NAME', value: 'production' }],
    resource: { limits: { cpu: '1000m', memory: '1Gi' } },
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
