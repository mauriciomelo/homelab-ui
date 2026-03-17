import { http, HttpResponse } from 'msw';
import { APP_STATUS } from '@/app/constants';

export const handlers = [
  http.post('*/api/control-plane/rpc/apps/list', () => {
    return HttpResponse.json({
      json: [
        {
          apiVersion: 'tesselar.io/v1alpha1',
          kind: 'App',
          metadata: {
            name: 'my-app',
          },
          spec: {
            image: 'postgres:16',
            envVariables: [{ name: 'DB_NAME', value: 'production' }],
          },
          status: {
            phase: APP_STATUS.RUNNING,
            placements: [],
            conditions: [],
          },
        },
        {
          apiVersion: 'tesselar.io/v1alpha1',
          kind: 'App',
          metadata: {
            name: 'web-app',
          },
          spec: {
            image: 'nginx:latest',
            envVariables: [],
          },
          status: {
            phase: APP_STATUS.RUNNING,
            placements: [],
            conditions: [],
          },
        },
      ],
    });
  }),
];
