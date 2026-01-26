import {
  CPU_UNITS,
  extractAmountAndUnit,
  isUnitValid,
  MEMORY_UNITS,
} from '@/lib/resource-utils';
import { z } from 'zod';
import { authClientSchema } from './auth-client-schema';

const additionalResourceSchema = z.union([authClientSchema]);
const envVariableSchema = z.union([
  z.object({
    name: z.string().min(1, 'Variable name is required'),
    value: z.string().min(1, 'Variable value is required'),
  }),
  z.object({
    name: z.string().min(1, 'Variable name is required'),
    valueFrom: z.object({
      secretKeyRef: z.object({
        name: z.string().min(1, 'Secret name is required'),
        key: z.string().min(1, 'Secret key is required'),
      }),
    }),
  }),
]);

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
              code: 'custom',
              message: 'Port name must be unique',
              path: [index, 'name'],
            });
          }
          names.add(port.name);

          if (port.containerPort && numbers.has(port.containerPort)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Port number must be unique',
              path: [index, 'containerPort'],
            });
          }
          numbers.add(port.containerPort);
        });
      }),
    envVariables: z.array(envVariableSchema),
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
    additionalResources: z.array(additionalResourceSchema).optional(),
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
  )
  .superRefine((data, ctx) => {
    validateBrokenEnvReferences(data).forEach(({ index }) => {
      ctx.addIssue({
        code: 'custom',
        message: 'Secret reference must match an existing resource',
        path: ['envVariables', index, 'value'],
      });
    });
  });

export type AppSchema = z.infer<typeof appSchema>;

function validateBrokenEnvReferences(data: AppSchema) {
  const authClientNames = new Set(
    deriveResourceReferences(data.additionalResources).map(
      (reference) => reference.name,
    ),
  );

  return data.envVariables.flatMap((envVariable, index) => {
    if ('valueFrom' in envVariable) {
      const secretName = envVariable.valueFrom.secretKeyRef.name;
      if (!authClientNames.has(secretName)) {
        return [{ index, secretName }];
      }
    }

    return [];
  });
}

export function deriveResourceReferences(
  resources: AppSchema['additionalResources'],
) {
  const references = resources
    ?.map((resource) => {
      if (resource.kind === 'AuthClient') {
        return {
          name: resource.metadata.name,
          kind: resource.kind,
          keys: ['client-id', 'client-secret'] as const,
        };
      }
      return null;
    })
    .filter((resource) => resource !== null);

  return references ?? [];
}
