import { z } from 'zod';
import { additionalResourceSchema, deriveResourceReferences } from './additional-resource-schema';
import { appSchema, defaultAppData } from './app-schema';

export const appBundleSchema = z
  .object({
    app: appSchema,
    additionalResources: z.array(additionalResourceSchema),
  })
  .superRefine((data, ctx) => {
    validateBrokenEnvReferences(data).forEach(({ index }) => {
      ctx.addIssue({
        code: 'custom',
        message: 'Secret reference must match an existing resource',
        path: ['app', 'spec', 'envVariables', index, 'value'],
      });
    });

    validateBrokenVolumeMountReferences(data).forEach(({ index }) => {
      ctx.addIssue({
        code: 'custom',
        message: 'Volume mount must reference a persistent volume',
        path: ['app', 'spec', 'volumeMounts', index, 'name'],
      });
    });
  });

export type AppBundleSchema = z.infer<typeof appBundleSchema>;

export const defaultAppBundleData = {
  app: defaultAppData,
  additionalResources: [],
} satisfies AppBundleSchema;

function validateBrokenEnvReferences(data: AppBundleSchema) {
  const authClientNames = new Set(
    deriveResourceReferences(data.additionalResources).map(
      (reference) => reference.name,
    ),
  );

  return data.app.spec.envVariables.flatMap((envVariable, index) => {
    if ('valueFrom' in envVariable) {
      const secretName = envVariable.valueFrom.secretKeyRef.name;
      if (!authClientNames.has(secretName)) {
        return [{ index, secretName }];
      }
    }

    return [];
  });
}

function validateBrokenVolumeMountReferences(data: AppBundleSchema) {
  const pvcNames = new Set(
    data.additionalResources
      .filter((resource) => resource.kind === 'PersistentVolumeClaim')
      .map((resource) => resource.metadata.name),
  );

  return (data.app.spec.volumeMounts ?? []).flatMap((volumeMount, index) => {
    if (!pvcNames.has(volumeMount.name)) {
      return [{ index, name: volumeMount.name }];
    }

    return [];
  });
}
