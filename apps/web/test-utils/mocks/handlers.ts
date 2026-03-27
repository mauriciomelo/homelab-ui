import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('*/api/app/rpc/apps/list', () => {
    return HttpResponse.json({
      json: [],
    });
  }),
  http.post('*/api/control-plane/rpc/apps/getLiveApps', () => {
    return HttpResponse.json({
      json: [],
    });
  }),
  http.post('*/api/control-plane/rpc/apps/reconcileFluxGitRepository', () => {
    return HttpResponse.json({
      json: null,
    });
  }),
  http.post('*/api/app/rpc/apps/publish', () => {
    return HttpResponse.json({
      json: { success: true },
    });
  }),
];
