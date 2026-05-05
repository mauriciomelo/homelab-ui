import {
  CPU_UNITS,
  defaultResourceRequests,
  extractAmountAndUnit,
  isUnitValid,
  MEMORY_UNITS,
  resourceLimitPreset,
} from '@/lib/resource-utils';
import { APP_STATUS } from '@/app/constants';
import { z } from 'zod';

import { jsonValueSchema } from './json-value-schema';

const appConditionSchema = z.object({
  type: z.string(),
  status: z.string(),
  lastTransitionTime: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
});

export const appStatusSchema = z.object({
  phase: z.enum([APP_STATUS.RUNNING, APP_STATUS.PENDING, APP_STATUS.UNKNOWN]),
  observedGeneration: z.number().int().optional(),
  placements: z.array(
    z.object({
      nodeName: z.string().optional(),
    }),
  ),
  conditions: z.array(appConditionSchema),
});
const envVariableSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Variable name is required')
      .meta({ description: 'Environment variable name' }),
    value: z.string().optional().meta({
      description:
        'Environment variable literal value (example: "https://example.com")',
    }),
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
      .optional()
      .meta({ description: 'Value sourced from a secret' }),
  })
  .superRefine((envVariable, ctx) => {
    const hasValue = envVariable.value !== undefined;
    const hasValueFrom = envVariable.valueFrom !== undefined;

    if (hasValue && hasValueFrom) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either a literal value or a secret reference',
        path: ['value'],
      });
    }

    if (!hasValue && !hasValueFrom) {
      ctx.addIssue({
        code: 'custom',
        message: 'Variable value is required',
        path: ['value'],
      });
    }

    if (hasValue && envVariable.value?.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Variable value is required',
        path: ['value'],
      });
    }
  });
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

function cpuQuantitySchema(description: string) {
  return z
    .string()
    .min(1, 'CPU is required')
    .transform((val) => extractAmountAndUnit(val))
    .refine(({ amount }) => amount > 0, 'CPU must be greater than 0')
    .refine(
      ({ unit }) => isUnitValid(unit, CPU_UNITS),
      'Invalid CPU unit. Use "1000m" for millicores or "1" for cores',
    )
    .transform(({ amount, unit }) => `${amount}${unit}`)
    .meta({ description });
}

function memoryQuantitySchema(description: string) {
  return z
    .string()
    .min(1, 'Memory is required')
    .transform((val) => extractAmountAndUnit(val))
    .refine(({ amount }) => amount > 0, 'Memory must be greater than 0')
    .refine(
      ({ unit }) => isUnitValid(unit, MEMORY_UNITS),
      'Invalid memory unit. Use "512Mi", "1Gi", or "512Ki"',
    )
    .transform(({ amount, unit }) => `${amount}${unit}`)
    .meta({ description });
}

const computeResourceRequestsSchema = z.object({
  cpu: cpuQuantitySchema('CPU request (e.g. 50m or 0.05)'),
  memory: memoryQuantitySchema('Memory request (e.g. 128Mi or 1Gi)'),
});

const computeResourceLimitsSchema = z.object({
  cpu: cpuQuantitySchema('CPU limit (e.g. 1000m or 1)'),
  memory: memoryQuantitySchema('Memory limit (e.g. 512Mi or 1Gi)'),
});

const allowedDeploymentPatchPrefixes = [
  '/spec/template/spec/affinity',
  '/spec/template/spec/containers/0/args',
  '/spec/template/spec/containers/0/command',
  '/spec/template/spec/containers/0/env',
  '/spec/template/spec/containers/0/envFrom',
  '/spec/template/spec/containers/0/livenessProbe',
  '/spec/template/spec/containers/0/readinessProbe',
  '/spec/template/spec/containers/0/resources',
  '/spec/template/spec/containers/0/securityContext',
  '/spec/template/spec/containers/0/startupProbe',
  '/spec/template/spec/containers/0/volumeMounts',
  '/spec/template/spec/dnsPolicy',
  '/spec/template/spec/hostNetwork',
  '/spec/template/spec/imagePullSecrets',
  '/spec/template/spec/initContainers',
  '/spec/template/spec/nodeSelector',
  '/spec/template/spec/securityContext',
  '/spec/template/spec/serviceAccountName',
  '/spec/template/spec/tolerations',
  '/spec/template/spec/volumes',
] as const;

function deploymentPatchPathSchema(description: string) {
  return z
    .string()
    .regex(/^\/.+/, 'JSON pointer path must start with /')
    .refine(
      isAllowedDeploymentPatchPath,
      `Deployment patch path must target one of: ${allowedDeploymentPatchPrefixes.join(', ')}`,
    )
    .meta({ description });
}

const deploymentPatchValueSchema = jsonValueSchema.meta({
  description: 'JSON patch value payload when required by the operation',
});

export const deploymentJsonPatchSchema = z
  .object({
    op: z
      .enum(['add', 'remove', 'replace', 'move', 'copy', 'test'])
      .meta({ description: 'RFC 6902 patch operation' }),
    path: deploymentPatchPathSchema('RFC 6901 JSON pointer path'),
    from: deploymentPatchPathSchema(
      'Source JSON pointer path for move/copy operations',
    ).optional(),
    value: deploymentPatchValueSchema.optional(),
  })
  .superRefine((patch, ctx) => {
    const requiresValue = ['add', 'replace', 'test'].includes(patch.op);
    const requiresFrom = ['move', 'copy'].includes(patch.op);

    if (requiresValue && patch.value === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Patch value is required for this operation',
        path: ['value'],
      });
    }

    if (!requiresValue && patch.value !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Patch value is not used by this operation',
        path: ['value'],
      });
    }

    if (requiresFrom && patch.from === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Patch from path is required for this operation',
        path: ['from'],
      });
    }

    if (!requiresFrom && patch.from !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Patch from path is not used by this operation',
        path: ['from'],
      });
    }
  });

type DeploymentJsonPatchInput = z.infer<typeof deploymentJsonPatchSchema>;

type DeploymentJsonPatchOperation =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'move' | 'copy'; path: string; from: string }
  | { op: 'remove'; path: string };

export const deploymentJsonPatchOperationSchema = deploymentJsonPatchSchema.transform(
  (patch: DeploymentJsonPatchInput): DeploymentJsonPatchOperation => {
    switch (patch.op) {
      case 'add':
      case 'replace':
      case 'test':
        return { op: patch.op, path: patch.path, value: patch.value! };
      case 'move':
      case 'copy':
        return { op: patch.op, path: patch.path, from: patch.from! };
      case 'remove':
        return { op: patch.op, path: patch.path };
    }
  },
);

function isAllowedDeploymentPatchPath(path: string) {
  return allowedDeploymentPatchPrefixes.some((prefix) => hasPathPrefix(path, prefix));
}

function hasPathPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

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
        annotations: z
          .record(z.string(), z.string())
          .optional()
          .meta({
            description: 'Optional metadata annotations for the app resource',
          }),
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
            requests: computeResourceRequestsSchema.meta({
              description: 'Resource requests for the app',
            }),
            limits: computeResourceLimitsSchema
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
        overrides: z
          .object({
            deploymentJsonPatches: z
              .array(deploymentJsonPatchSchema)
              .optional()
              .meta({
                description:
                  'Advanced JSON patches applied to the generated Deployment before reconciliation',
              }),
          })
          .optional()
          .meta({ description: 'Advanced generated-resource overrides' }),
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
  );

export type AppSchema = z.infer<typeof appSchema>;
export type AppSpecSchema = AppSchema['spec'];
export type AppStatusSchema = z.infer<typeof appStatusSchema>;
export type DeploymentJsonPatchSchema = z.infer<
  typeof deploymentJsonPatchSchema
>;
export const appCrdSchema = z.object({
  spec: appSchema.shape.spec,
  status: appStatusSchema.optional(),
});
export const appResourceSchema = appSchema.safeExtend({
  status: appStatusSchema.optional(),
});
export type AppResourceSchema = z.infer<typeof appResourceSchema>;

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
      requests: defaultResourceRequests,
      limits: resourceLimitPreset.small.limits,
    },
    ingress: {
      port: { name: 'http' },
    },
  },
} satisfies AppSchema;
