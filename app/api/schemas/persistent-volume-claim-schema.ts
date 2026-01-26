import {
  extractAmountAndUnit,
  isUnitValid,
  MEMORY_UNITS,
} from '@/lib/resource-utils';
import * as z from 'zod';

export const persistentVolumeClaimSchema = z.object({
  apiVersion: z.literal('v1'),
  kind: z.literal('PersistentVolumeClaim'),
  metadata: z.object({
    name: z.string().min(1, 'Persistent volume name is required'),
  }),
  spec: z.object({
    accessModes: z
      .array(z.string().min(1, 'Access mode is required'))
      .min(1, 'At least one access mode is required'),
    storageClassName: z.literal('longhorn'),
    resources: z.object({
      requests: z.object({
        storage: z
          .string()
          .min(1, 'Storage is required')
          .transform((value) => extractAmountAndUnit(value))
          .refine(({ amount }) => amount > 0, 'Storage must be greater than 0')
          .refine(
            ({ unit }) => isUnitValid(unit, MEMORY_UNITS),
            'Invalid storage unit. Use "512Mi", "1Gi", or "512Ki"',
          )
          .transform(({ amount, unit }) => `${amount}${unit}`),
      }),
    }),
  }),
});

export type PersistentVolumeClaimSchema = z.infer<
  typeof persistentVolumeClaimSchema
>;
