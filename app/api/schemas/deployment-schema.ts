import * as z from 'zod';

export const deploymentSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Deployment'),
  metadata: z.object({
    name: z.string(),
  }),
  spec: z.object({
    replicas: z.number().optional(),
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
          }),
        ),
        volumes: z
          .array(
            z.object({
              name: z.string(),
              persistentVolumeClaim: z.object({
                claimName: z.string(),
              }),
            }),
          )
          .optional(),
      }),
    }),
  }),
});
