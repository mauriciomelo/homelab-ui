import {
  CPU_UNITS,
  extractAmountAndUnit,
  isUnitValid,
  MEMORY_UNITS,
} from '@/lib/resource-utils';
import { z } from 'zod';

export const appSchema = z
  .object({
    name: z.string().min(1, 'App name is required'),
    image: z.string().min(1, 'App image is required'),
    ports: z
      .array(
        z.object({
          name: z
            .string()
            .min(1, 'Port name is required')
            .regex(
              /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
              'Port name must be lowercase alphanumeric with hyphens',
            ),
          containerPort: z
            .number()
            .int()
            .min(1, 'Port must be at least 1')
            .max(65535, 'Port cannot exceed 65535'),
        }),
      )
      .min(1, 'At least one port is required')
      .superRefine((ports, ctx) => {
        const names = new Set();
        const numbers = new Set();

        ports.forEach((port, index) => {
          if (port.name && names.has(port.name)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Port name must be unique',
              path: [index, 'name'],
            });
          }
          names.add(port.name);

          if (port.containerPort && numbers.has(port.containerPort)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Port number must be unique',
              path: [index, 'containerPort'],
            });
          }
          numbers.add(port.containerPort);
        });
      }),
    envVariables: z.array(
      z.object({
        name: z.string().min(1, 'Variable name is required'),
        value: z.string().min(1, 'Variable value is required'),
      }),
    ),
    resources: z.object({
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
    ingress: z.object({
      port: z.object({
        name: z.string().min(1, 'Ingress port name is required'),
      }),
    }),
  })
  .refine(
    (data) => {
      const portNames = data.ports.map((p) => p.name);
      return portNames.includes(data.ingress.port.name);
    },
    {
      message:
        'Ingress port name must reference a port in the defined ports list',
      path: ['ingress', 'port', 'name'],
    },
  );

export type AppSchema = z.infer<typeof appSchema>;
