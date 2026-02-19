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
