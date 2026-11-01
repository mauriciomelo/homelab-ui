import { http, HttpResponse } from 'msw';
import { orpcEventStreamResponse } from '../orpc';

export const handlers = [
  http.post('*/api/app/rpc/apps/update', () => HttpResponse.json({ json: { success: true } })),
  http.post('*/api/app/rpc/apps/list', () => {
    return HttpResponse.json({
      json: [],
    });
  }),
  http.post('*/api/app/rpc/apps/watchApps', () => {
    return orpcEventStreamResponse([[]]);
  }),
  http.post('*/api/app/rpc/apps/getApp', () => {
    return HttpResponse.json(
      {
        error: {
          message: 'App not found',
        },
      },
      { status: 404 },
    );
  }),
  http.post('*/api/control-plane/rpc/apps/getLiveApps', () => {
    return HttpResponse.json({
      json: [],
    });
  }),
  http.post('*/api/app/rpc/apps/create', () => {
    return HttpResponse.json({
      json: { success: true },
    });
  }),
];
