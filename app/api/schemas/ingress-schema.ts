import * as z from 'zod';

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
        http: z.object({
          paths: z.array(
            z.object({
              path: z.string(),
              pathType: z.literal('Prefix'),
              backend: z.object({
                service: z.object({
                  name: z.string(),
                  port: z.object({
                    name: z.string(),
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

export type IngressSchema = z.infer<typeof ingressSchema>;
