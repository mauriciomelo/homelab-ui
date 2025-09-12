import * as z from 'zod';

export const kustomizationSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Kustomization'),
  metadata: z.object({
    name: z.string(),
  }),
  namespace: z.string(),
  resources: z.array(z.string()),
});

export const ingressSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Ingress'),
  metadata: z.object({
    name: z.string(),
    annotations: z.record(z.string(), z.string()),
  }),
  spec: z.object({
    rules: z.array(
      z.object({
        host: z.string(),
        http: z.object({
          paths: z.array(
            z.object({
              path: z.string(),
              pathType: z.literal('Prefix'),
              backend: z.object({
                service: z.object({
                  name: z.string(),
                  port: z.object({
                    number: z.number(),
                  }),
                }),
              }),
            }),
          ),
        }),
      }),
    ),
  }),
});

export const deploymentSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Deployment'),
  metadata: z.object({
    name: z.string(),
  }),
  spec: z.object({
    selector: z.object({
      matchLabels: z.object({
        app: z.string(),
      }),
    }),
    template: z.object({
      metadata: z.object({
        labels: z.object({
          app: z.string(),
        }),
      }),
      spec: z.object({
        containers: z.array(
          z.object({
            name: z.string(),
            image: z.string(),
            env: z.array(
              z.object({
                name: z.string(),
                value: z.string(),
              }),
            ),
          }),
        ),
      }),
    }),
  }),
});

export const APP_STATUS = {
  RUNNING: 'Running',
  PENDING: 'Pending',
  UNKNOWN: 'Unknown',
} as const;

export type AppStatus = (typeof APP_STATUS)[keyof typeof APP_STATUS];

export const DEVICE_STATUS = {
  HEALTHY: 'Healthy',
  UNHEALTHY: 'Unhealthy',
  OFFLINE: 'Offline',
  NEW: 'New',
} as const;

export type DeviceStatus = (typeof DEVICE_STATUS)[keyof typeof DEVICE_STATUS];
