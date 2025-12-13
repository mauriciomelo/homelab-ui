import { expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Apps } from './(dashboard)/apps/apps';
import { renderWithProviders, server } from '@/test-utils';
import { http, HttpResponse } from 'msw';
import { APP_STATUS } from '@/app/api/schemas';
import type { App } from '@/app/api/applications';

vi.mock('server-only', () => ({}));

test('AppsPage', async () => {
  // Mock the tRPC apps endpoint with proper typing using satisfies
  const mockAppsResponse: App[] = [
    {
      spec: {
        name: 'myapp',
        image: 'nginx:latest',
        envVariables: [
          {
            name: 'NODE_ENV',
            value: 'production',
          },
        ],
      },
      pods: [
        {
          name: 'my-app-pod-123',
          metadata: {
            creationTimestamp: '2023-01-01T00:00:00Z' as unknown as Date,
          },
          spec: {
            nodeName: 'node-1',
          },
          status: {
            phase: APP_STATUS.RUNNING,
            startTime: '2023-01-01T00:00:00Z' as unknown as Date,
            message: 'Pod is running',
            reason: 'Running',
            conditions: [],
          },
        },
      ],
      iconUrl: 'https://cdn.simpleicons.org/myapp',
      deployment: {
        spec: {
          replicas: 1,
        },
        status: {
          availableReplicas: 1,
          replicas: 1,
          readyReplicas: 1,
          updatedReplicas: 1,
          conditions: [
            {
              type: 'Available',
              status: 'True',
              lastTransitionTime: '2023-01-01T00:00:00Z' as unknown as Date,
              reason: 'MinimumReplicasAvailable',
              message: 'Deployment has minimum availability.',
            },
          ],
        },
      },
      status: APP_STATUS.RUNNING,
      link: 'http://my-app.local',
    },
  ] satisfies App[];

  server.use(
    http.get('*/api/trpc/apps', () => {
      return HttpResponse.json({
        result: {
          data: {
            json: mockAppsResponse,
          },
        },
      });
    }),
  );

  renderWithProviders(<Apps />);
  expect(screen.getByText('A list of your installed Apps.')).toBeDefined();

  await waitFor(() => expect(screen.getByText('myapp')).toBeDefined());
});
