import * as z from 'zod';

export const serviceSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Service'),
  metadata: z.object({
    name: z.string(),
  }),
  spec: z.object({
    type: z.string().optional(),
    selector: z.object({
      app: z.string(),
    }),
    ports: z.array(
      z.object({
        name: z.string(),
        port: z.number(),
        protocol: z.string().optional(),
        targetPort: z.union([z.string(), z.number()]).optional(),
      }),
    ),
  }),
});

export type ServiceSchema = z.infer<typeof serviceSchema>;
