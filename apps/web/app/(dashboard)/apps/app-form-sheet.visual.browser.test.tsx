import { describe, expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import { produce } from 'immer';
import { http } from 'msw';
import { AppFormSheet } from './app-form-sheet';
import {
  orpcEventStreamResponse,
  orpcJsonResponse,
  renderWithProviders,
  test,
} from '@/test-utils/browser';
import { baseApp } from '@/test-utils/fixtures';

vi.mock('server-only', () => ({}));

describe('app-form-sheet visual', () => {
  test('renders a full-featured app edit sheet', async ({ worker }) => {
    const fullFeaturedApp = produce(baseApp, (app) => {
      app.app.metadata.name = 'openwebui';
      app.app.spec.image = 'ghcr.io/open-webui/open-webui:main';
      app.app.spec.ports = [
        { name: 'web', containerPort: 8080 },
        { name: 'metrics', containerPort: 9090 },
      ];
      app.app.spec.envVariables = [
        {
          name: 'OAUTH_CLIENT_ID',
          valueFrom: {
            secretKeyRef: {
              name: 'openwebui-auth-client',
              key: 'client-id',
            },
          },
        },
        {
          name: 'OAUTH_CLIENT_SECRET',
          valueFrom: {
            secretKeyRef: {
              name: 'openwebui-auth-client',
              key: 'client-secret',
            },
          },
        },
        {
          name: 'WEBUI_URL',
          value: 'https://openwebui.home.example.com',
        },
      ];
      app.app.spec.resources.limits = { cpu: '500m', memory: '512Mi' };
      app.app.spec.ingress = { port: { name: 'web' } };
      app.app.spec.health = {
        check: {
          type: 'httpGet',
          path: '/healthz',
          port: 'web',
        },
      };
      app.additionalResources = [
        {
          apiVersion: 'tesselar.io/v1',
          kind: 'AuthClient',
          metadata: { name: 'openwebui-auth-client' },
          spec: {
            redirectUris: [
              'https://openwebui.home.example.com/oauth/oidc/callback',
            ],
          },
        },
        {
          apiVersion: 'v1',
          kind: 'PersistentVolumeClaim',
          metadata: { name: 'openwebui-data' },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: 'longhorn',
            resources: {
              requests: {
                storage: '5Gi',
              },
            },
          },
        },
      ];
      app.app.spec.volumeMounts = [
        {
          name: 'openwebui-data',
          mountPath: '/app/backend/data',
        },
      ];
    });

    worker.use(
      http.post('*/api/app/rpc/apps/getApp', () =>
        orpcJsonResponse({
          app: fullFeaturedApp.app,
          additionalResources: fullFeaturedApp.additionalResources,
        }),
      ),
      http.post('*/api/app/rpc/apps/watchApp', () =>
        orpcEventStreamResponse([
          {
            app: fullFeaturedApp.app,
            additionalResources: fullFeaturedApp.additionalResources,
          },
        ]),
      ),
    );

    page.viewport(800, 2000);
    await renderWithProviders(
      <AppFormSheet
        open
        session={{
          mode: 'edit',
          identifier: { appName: fullFeaturedApp.app.metadata.name },
          initialData: fullFeaturedApp,
        }}
        onSessionChange={() => {}}
        onOpenChange={() => {}}
      />,
    );

    await expect
      .poll(() => page.getByText("Edit the App's configuration."))
      .toBeInTheDocument();
    await expect.poll(() => page.getByText('App Basics')).toBeInTheDocument();
    await expect
      .poll(() => page.getByText('Resource Limits'))
      .toBeInTheDocument();
    await expect
      .poll(() => page.getByText('Environment Variables', { exact: true }))
      .toBeInTheDocument();
    await expect
      .poll(() => page.getByText('Additional Resources', { exact: true }))
      .toBeInTheDocument();

    await expect(page.getByRole('dialog')).toMatchScreenshot();
  });
});
