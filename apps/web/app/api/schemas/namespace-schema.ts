import * as z from 'zod';

export const namespaceSchema = z.object({
  apiVersion: z.string(),
  kind: z.literal('Namespace'),
  metadata: z.object({
    name: z.string(),
    labels: z.record(z.string(), z.string()).optional(),
  }),
});

export type NamespaceSchema = z.infer<typeof namespaceSchema>;
