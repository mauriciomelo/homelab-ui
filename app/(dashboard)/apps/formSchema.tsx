import {
  CPU_UNITS,
  extractAmountAndUnit,
  isUnitValid,
  MEMORY_UNITS,
} from '@/lib/resource-utils';
import { z } from 'zod';

export const appFormSchema = z.object({
  name: z.string().min(1, 'App name is required'),
  image: z.string().min(1, 'App image is required'),
  envVariables: z.array(
    z.object({
      name: z.string().min(1, 'Variable name is required'),
      value: z.string().min(1, 'Variable value is required'),
    }),
  ),
  resource: z.object({
    limits: z.object({
      cpu: z
        .string()
        .min(1, 'CPU is required')
        .transform((val) => extractAmountAndUnit(val))
        .refine(({ amount }) => amount > 0, 'CPU must be greater than 0')
        .refine(
          ({ unit }) => isUnitValid(unit, CPU_UNITS),
          'Invalid CPU unit. Use "1000m" for millicores or "1" for cores',
        )
        .transform(({ amount, unit }) => `${amount}${unit}`),

      memory: z
        .string()
        .min(1, 'Memory is required')
        .transform((val) => extractAmountAndUnit(val))
        .refine(({ amount }) => amount > 0, 'Memory must be greater than 0')
        .refine(
          ({ unit }) => isUnitValid(unit, MEMORY_UNITS),
          'Invalid memory unit. Use "512Mi", "1Gi", or "512Ki"',
        )
        .transform(({ amount, unit }) => `${amount}${unit}`),
    }),
  }),
});

export type AppFormSchema = z.infer<typeof appFormSchema>;
