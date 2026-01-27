import * as z from 'zod';

export const traefikConfigSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('HelmChartConfig'),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
  }),
  spec: z.object({
    valuesContent: z.string(),
  }),
});

export const traefikValuesContentSchema = z.object({
  providers: z.object({
    kubernetesIngress: z.object({
      defaultRule: z.string(),
    }),
  }),
});

export type TraefikConfigSchema = z.infer<typeof traefikConfigSchema>;
