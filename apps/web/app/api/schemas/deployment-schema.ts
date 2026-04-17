import * as z from 'zod';

import { jsonValueSchema } from './json-value-schema';

const httpGetSchema = z.object({
  path: z.string(),
  port: z.string(),
});

const probeSchema = z.object({
  httpGet: httpGetSchema,
  initialDelaySeconds: z.number().optional(),
  periodSeconds: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  successThreshold: z.number().optional(),
  failureThreshold: z.number().optional(),
});

const deploymentContainerSchema = z
  .object({
    name: z.string(),
    image: z.string(),
    ports: z.array(
      z.object({
        name: z.string(),
        containerPort: z.number(),
      }),
    ),
    env: z
      .array(
        z.union([
          z.object({
            name: z.string(),
            value: z.string(),
          }),
          z.object({
            name: z.string(),
            valueFrom: z.object({
              secretKeyRef: z.object({
                key: z.string(),
                name: z.string(),
              }),
            }),
          }),
        ]),
      )
      .optional(),
    volumeMounts: z
      .array(
        z.object({
          name: z.string(),
          mountPath: z.string(),
        }),
      )
      .optional(),
    resources: z.object({
      limits: z.object({
        cpu: z.string(),
        memory: z.string(),
      }),
    }),
    startupProbe: probeSchema.optional(),
    readinessProbe: probeSchema.optional(),
    livenessProbe: probeSchema.optional(),
  })
  .catchall(jsonValueSchema);

const deploymentPodSpecSchema = z
  .object({
    containers: z.array(deploymentContainerSchema),
    volumes: z
      .array(
        z.union([
          z.object({
            name: z.string(),
            persistentVolumeClaim: z.object({
              claimName: z.string(),
            }),
          }),
          z.object({
            name: z.string(),
            nfs: z.object({
              server: z.string(),
              path: z.string(),
            }),
          }),
        ]),
      )
      .optional(),
  })
  .catchall(jsonValueSchema);

export const deploymentSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Deployment'),
  metadata: z.object({
    name: z.string(),
  }),
  spec: z.object({
    replicas: z.number().optional(),
    strategy: z
      .object({
        type: z.literal('Recreate'),
      })
      .optional(),
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
      spec: deploymentPodSpecSchema,
    }),
  }),
});
