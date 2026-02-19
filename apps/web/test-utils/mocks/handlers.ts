import { http, HttpResponse } from 'msw';
import { APP_STATUS } from '@/app/constants';

export const handlers = [
  http.post('*/api/control-plane/rpc/apps/list', () => {
    return HttpResponse.json({
      json: [
        {
          name: 'my-app',
          spec: {
            name: 'my-app',
            image: 'postgres:16',
            envVariables: [{ name: 'DB_NAME', value: 'production' }],
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
            },
          },
        },
        {
          name: 'web-app',
          spec: {
            name: 'web-app',
            image: 'nginx:latest',
            envVariables: [],
          },
          status: APP_STATUS.RUNNING,
          pods: [],
          iconUrl: 'https://cdn.simpleicons.org/web-app',
          deployment: {
            spec: { replicas: 2 },
            status: {
              availableReplicas: 2,
              replicas: 2,
              readyReplicas: 2,
              updatedReplicas: 2,
            },
          },
        },
      ],
    });
  }),
];
