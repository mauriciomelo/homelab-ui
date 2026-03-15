import {
  CPU_UNITS,
  extractAmountAndUnit,
  isUnitValid,
  MEMORY_UNITS,
  resourceLimitPreset,
} from '@/lib/resource-utils';
import { z } from 'zod';
const envVariableSchema = z.union([
  z.object({
    name: z
      .string()
      .min(1, 'Variable name is required')
      .meta({ description: 'Environment variable name' }),
    value: z.string().min(1, 'Variable value is required').meta({
      description:
        'Environment variable literal value (example: "https://example.com")',
    }),
  }),
  z.object({
    name: z
      .string()
      .min(1, 'Variable name is required')
      .meta({ description: 'Environment variable name' }),
    valueFrom: z
      .object({
        secretKeyRef: z
          .object({
            name: z.string().min(1, 'Secret name is required').meta({
              description:
                'Secret resource name (example: "SSO" to match an AuthClient named SSO)',
            }),
            key: z.string().min(1, 'Secret key is required').meta({
              description:
                'Secret key to read (example: "client-id" or "client-secret")',
            }),
          })
          .meta({ description: 'Secret key reference' }),
      })
      .meta({ description: 'Value sourced from a secret' }),
  }),
]);
const volumeMountSchema = z.object({
  mountPath: z
    .string()
    .min(1, 'Mount path is required')
    .meta({ description: 'Container mount path for the volume' }),
  name: z
    .string()
    .min(1, 'Persistent volume name is required')
    .meta({ description: 'Persistent volume claim name' }),
});
const healthCheckSchema = z.object({
  type: z.literal('httpGet').meta({ description: 'HTTP GET health check' }),
  path: z
    .string()
    .min(1, 'Health check path is required')
    .meta({ description: 'HTTP path to probe for health' }),
  port: z
    .string()
    .min(1, 'Health check port is required')
    .meta({ description: 'Port name to use for health checks' }),
});
const healthSchema = z.object({
  check: healthCheckSchema.meta({ description: 'Health check settings' }),
});

export const appSchema = z
  .object({
    apiVersion: z.literal('tesselar.io/v1alpha1').meta({
      description: 'API version for the app resource',
    }),
    kind: z.literal('App').meta({ description: 'App resource kind' }),
    metadata: z
      .object({
        name: z
          .string()
          .min(1, 'App name is required')
          .meta({ description: 'The name of the application' }),
      })
      .meta({ description: 'App resource metadata' }),
    spec: z
      .object({
        image: z
          .string()
          .min(1, 'App image is required')
          .meta({ description: 'Container image to deploy' }),
        ports: z
          .array(
            z.object({
              name: z
                .string()
                .min(1, 'Port name is required')
                .regex(
                  /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
                  'Port name must be lowercase alphanumeric with hyphens',
                )
                .meta({
                  description:
                    'Port name for references (named ports can be used by ingress.port.name and health.check.port)',
                }),
              containerPort: z
                .number()
                .int()
                .min(1, 'Port must be at least 1')
                .max(65535, 'Port cannot exceed 65535')
                .meta({ description: 'Container port number' }),
            }),
          )
          .min(1, 'At least one port is required')
          .meta({ description: 'Container ports exposed by the app' })
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
        envVariables: z.array(envVariableSchema).meta({
          description:
            'Environment variables for the app; can reference AuthClient secrets via valueFrom.secretKeyRef',
        }),
        volumeMounts: z
          .array(volumeMountSchema)
          .optional()
          .meta({ description: 'Persistent volume mounts' }),
        resources: z
          .object({
            limits: z
              .object({
                cpu: z
                  .string()
                  .min(1, 'CPU is required')
                  .transform((val) => extractAmountAndUnit(val))
                  .refine(
                    ({ amount }) => amount > 0,
                    'CPU must be greater than 0',
                  )
                  .refine(
                    ({ unit }) => isUnitValid(unit, CPU_UNITS),
                    'Invalid CPU unit. Use "1000m" for millicores or "1" for cores',
                  )
                  .transform(({ amount, unit }) => `${amount}${unit}`)
                  .meta({ description: 'CPU limit (e.g. 1000m or 1)' }),

                memory: z
                  .string()
                  .min(1, 'Memory is required')
                  .transform((val) => extractAmountAndUnit(val))
                  .refine(
                    ({ amount }) => amount > 0,
                    'Memory must be greater than 0',
                  )
                  .refine(
                    ({ unit }) => isUnitValid(unit, MEMORY_UNITS),
                    'Invalid memory unit. Use "512Mi", "1Gi", or "512Ki"',
                  )
                  .transform(({ amount, unit }) => `${amount}${unit}`)
                  .meta({ description: 'Memory limit (e.g. 512Mi or 1Gi)' }),
              })
              .meta({ description: 'Resource limits for the app' }),
          })
          .meta({ description: 'Compute resource settings' }),
        ingress: z
          .object({
            port: z
              .object({
                name: z
                  .string()
                  .min(1, 'Ingress port name is required')
                  .meta({ description: 'Port name to expose via ingress' }),
              })
              .meta({ description: 'Ingress port reference' }),
          })
          .meta({ description: 'Ingress configuration for the app' }),
        health: healthSchema
          .optional()
          .meta({ description: 'Optional health check configuration' }),
      })
      .meta({ description: 'Desired state for the app resource' }),
  })
  .refine(
    (data) => {
      const portNames = data.spec.ports.map((p) => p.name);
      return portNames.includes(data.spec.ingress.port.name);
    },
    {
      message:
        'Ingress port name must reference a port in the defined ports list',
      path: ['spec', 'ingress', 'port', 'name'],
    },
  )
  .refine(
    (data) => {
      if (!data.spec.health) {
        return true;
      }

      const portNames = data.spec.ports.map((p) => p.name);
      return portNames.includes(data.spec.health.check.port);
    },
    {
      message:
        'Health check port must reference a port in the defined ports list',
      path: ['spec', 'health', 'check', 'port'],
    },
  )
  ;

export type AppSchema = z.infer<typeof appSchema>;
export type AppSpecSchema = AppSchema['spec'];

export const defaultAppData = {
  apiVersion: 'tesselar.io/v1alpha1',
  kind: 'App',
  metadata: {
    name: '',
  },
  spec: {
    image: '',
    ports: [{ name: 'http', containerPort: 80 }],
    envVariables: [],
    health: {
      check: {
        type: 'httpGet',
        path: '/',
        port: 'http',
      },
    },
    volumeMounts: [],
    resources: {
      limits: resourceLimitPreset.small.limits,
    },
    ingress: {
      port: { name: 'http' },
    },
  },
} satisfies AppSchema;
