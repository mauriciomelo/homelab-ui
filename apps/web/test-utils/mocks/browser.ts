import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { APP_STATUS } from '@/app/constants';

const appsData = [
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
];

const handlers = [
  http.post('*/api/control-plane/rpc/apps/list', () => {
    return HttpResponse.json({
      json: appsData,
    });
  }),
  http.post('*/api/control-plane/rpc/apps/create', () => {
    return HttpResponse.json({
      json: { success: true },
    });
  }),
  http.post('*/api/control-plane/rpc/apps/update', () => {
    return HttpResponse.json({
      json: { success: true },
    });
  }),
];

export const worker = setupWorker(...handlers);
