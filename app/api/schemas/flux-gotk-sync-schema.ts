import * as z from 'zod';

export const fluxGotkKustomizationSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Kustomization'),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
  }),
  spec: z.object({
    postBuild: z.object({
      substitute: z.object({
        DOMAIN: z.string(),
      }),
    }),
  }),
});

export type FluxGotkKustomizationSchema = z.infer<
  typeof fluxGotkKustomizationSchema
>;
