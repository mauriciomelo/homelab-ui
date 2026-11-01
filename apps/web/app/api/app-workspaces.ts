import { z } from 'zod/v4';
import fs from 'fs';
import YAML from 'yaml';
import isEqual from 'lodash/isEqual';
import { customObjectsApi, coreApi } from './k8s';
import { getLiveApps, watchLiveApps } from './applications';
import {
  appBundleSchema,
  appSchema,
  appStatusSchema,
  authClientSchema,
  persistentVolumeClaimSchema,
  type AppBundleSchema,
  type AdditionalResourceSchema,
  kustomizationSchema,
  namespaceSchema,
} from './schemas';

const requiredBundleFiles: ReadonlySet<string> = new Set([
  'app.yaml',
  'namespace.yaml',
]);

export type PublishedAppBundle = z.infer<typeof publishedAppBundleSchema>;

export const publishedAppBundleSchema = appBundleSchema.safeExtend({
  status: appStatusSchema,
});

const identity = { group: 'tesselar.io', version: 'v1alpha1', plural: 'apps' };

const storedAppSchema = z.looseObject({
  metadata: z.looseObject({
    name: z.string(),
    namespace: z.string(),
    resourceVersion: z.string(),
  }),
});

// PVC lists identify the item type once, so items can omit apiVersion and kind.
const persistentVolumeClaimResponseSchema = z
  .object({
    ...persistentVolumeClaimSchema.shape,
    apiVersion: z.literal('v1').optional(),
    kind: z.literal('PersistentVolumeClaim').optional(),
  })
  .transform(({ metadata, spec }) =>
    persistentVolumeClaimSchema.parse({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata,
      spec,
    }),
  );

export async function getApp(input: unknown): Promise<AppBundleSchema> {
  const { appName: name } = z
    .object({ appName: z.string().min(1) })
    .parse(input);
  const { stored, app } = await readStoredApp(name);
  return appBundleSchema.parse({
    app,
    additionalResources: await readAdditionalResources(name),
    clusterResourceVersion: stored.metadata.resourceVersion,
  });
}

export async function createApp(input: AppBundleSchema) {
  const bundle = appBundleSchema.parse(input);
  const name = bundle.app.metadata.name;
  const existing: unknown = await customObjectsApi()
    .getNamespacedCustomObject({ ...identity, name, namespace: name })
    .catch((error: unknown) => {
      if (!isNotFound(error)) throw error;
      return undefined;
    });
  if (existing !== undefined) throw new Error(`App "${name}" already exists.`);
  try {
    await coreApi().readNamespace({ name });
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 404
    )
      throw error;
    await coreApi().createNamespace({
      body: { apiVersion: 'v1', kind: 'Namespace', metadata: { name } },
    });
  }
  await applyAdditionalResources(name, bundle.additionalResources);
  await customObjectsApi().createNamespacedCustomObject({
    ...identity,
    namespace: name,
    body: {
      ...bundle.app,
      metadata: { ...bundle.app.metadata, namespace: name },
    },
  });
  return { success: true };
}

export async function updateApp(input: AppBundleSchema) {
  const bundle = appBundleSchema.parse(input);
  if (!bundle.clusterResourceVersion) {
    throw new Error('Reload the app from the cluster before updating it.');
  }
  const name = bundle.app.metadata.name;
  const { stored } = await readStoredApp(name);
  if (bundle.clusterResourceVersion !== stored.metadata.resourceVersion) {
    throw new Error('The app changed in the cluster. Reload it before saving.');
  }
  await applyAdditionalResources(name, bundle.additionalResources);
  await customObjectsApi().replaceNamespacedCustomObject({
    ...identity,
    name,
    namespace: name,
    body: {
      ...stored,
      metadata: { ...stored.metadata, ...bundle.app.metadata },
      spec: bundle.app.spec,
    },
  });
  return { success: true };
}

export async function* watchApps(): AsyncGenerator<PublishedAppBundle[]> {
  for await (const apps of watchLiveApps()) {
    yield await Promise.all(
      apps.map(async (app) => ({
        ...(await getApp({ appName: app.metadata.name })),
        status: app.status,
      })),
    );
  }
}

export async function listApps(): Promise<PublishedAppBundle[]> {
  const apps = await getLiveApps();
  return Promise.all(
    apps.map(async (app) => ({
      ...(await getApp({ appName: app.metadata.name })),
      status: app.status,
    })),
  );
}

export async function getFile<T>({
  path: filePath,
  schema,
}: {
  path: string;
  schema: z.ZodType<T>;
}): Promise<{ data: T; raw: unknown }> {
  const fileText = await fs.promises.readFile(filePath, 'utf-8');

  const documents = YAML.parseAllDocuments(fileText.toString());
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw errors[0];
  }

  const rawDocuments = documents.map((document) => document.toJSON());
  if (rawDocuments.length === 1) {
    const raw = rawDocuments[0];
    return { data: schema.parse(raw), raw };
  }

  const matched = rawDocuments.find((raw) => schema.safeParse(raw).success);
  if (!matched) {
    throw new Error('No matching document found');
  }

  return { data: schema.parse(matched), raw: matched };
}

export async function readAppBundleFromDirectory(appPath: string): Promise<{
  app: z.infer<typeof appSchema>;
  additionalResources: AdditionalResourceSchema[];
}> {
  const kustomizationResult = await getFile({
    path: `${appPath}/kustomization.yaml`,
    schema: kustomizationSchema,
  });

  const kustomizationResources = new Set(kustomizationResult.data.resources);
  const missingRequiredFiles = requiredBundleFiles.difference(
    kustomizationResources,
  );

  if (missingRequiredFiles.size > 0) {
    throw new Error(
      Array.from(missingRequiredFiles)
        .map(
          (resourceFile) =>
            `kustomization.resources: Missing required resource "${resourceFile}"`,
        )
        .join('; '),
    );
  }

  const appResult = await getCanonicalApp(appPath);
  await getFile({
    path: `${appPath}/namespace.yaml`,
    schema: namespaceSchema,
  });

  function schemaForFile(
    filename: string,
  ): z.ZodType<AdditionalResourceSchema> | undefined {
    if (filename.match(/\.authclient\.yaml$/)) {
      return authClientSchema;
    }

    if (filename.match(/\.persistentvolumeclaim\.yaml$/)) {
      return persistentVolumeClaimSchema;
    }

    return undefined;
  }

  const additionalResources = await Promise.all(
    kustomizationResult.data.resources
      .filter((resourceFile) => !requiredBundleFiles.has(resourceFile))
      .map(async (resourceFile) => {
        const schema = schemaForFile(resourceFile);
        if (!schema) {
          throw new Error(
            `kustomization.resources: Unsupported resource file "${resourceFile}"`,
          );
        }

        const { data } = await getFile({
          path: `${appPath}/${resourceFile}`,
          schema,
        });

        return data;
      }),
  );

  const parsedBundle = appBundleSchema.parse({
    app: appResult,
    additionalResources,
  });

  return {
    app: parsedBundle.app,
    additionalResources: parsedBundle.additionalResources,
  };
}

async function getCanonicalApp(
  appPath: string,
): Promise<z.infer<typeof appSchema>> {
  const { data } = await getFile({
    path: `${appPath}/app.yaml`,
    schema: appSchema,
  });

  return data;
}

async function readStoredApp(name: string) {
  const result: unknown = await customObjectsApi().getNamespacedCustomObject({
    ...identity,
    name,
    namespace: name,
  });
  const stored = storedAppSchema.parse(result);
  if (stored.metadata.name !== name || stored.metadata.namespace !== name) {
    throw new Error('App name must match its namespace.');
  }
  return { stored, app: appSchema.parse(result) };
}

async function readAdditionalResources(namespace: string) {
  const [volumes, clients] = await Promise.all([
    coreApi().listNamespacedPersistentVolumeClaim({ namespace }),
    customObjectsApi().listNamespacedCustomObject({
      group: 'tesselar.io',
      version: 'v1',
      plural: 'authclients',
      namespace,
    }),
  ]);
  return [
    ...volumes.items.map((volume) =>
      persistentVolumeClaimResponseSchema.parse(volume),
    ),
    ...z.object({ items: z.array(authClientSchema) }).parse(clients).items,
  ];
}

function isNotFound(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 404
  );
}

async function applyAdditionalResources(
  namespace: string,
  resources: AdditionalResourceSchema[],
) {
  for (const resource of resources) {
    const name = resource.metadata.name;
    if (resource.kind === 'PersistentVolumeClaim') {
      const existing = await coreApi()
        .readNamespacedPersistentVolumeClaim({ name, namespace })
        .catch((error: unknown) => {
          if (!isNotFound(error)) throw error;
          return undefined;
        });
      if (!existing) {
        await coreApi().createNamespacedPersistentVolumeClaim({
          namespace,
          body: {
            ...resource,
            metadata: { ...resource.metadata, namespace },
          },
        });
      } else if (
        !isEqual(persistentVolumeClaimResponseSchema.parse(existing), resource)
      ) {
        await coreApi().replaceNamespacedPersistentVolumeClaim({
          name,
          namespace,
          body: {
            ...existing,
            metadata: { ...existing.metadata, ...resource.metadata, namespace },
            spec: { ...existing.spec, ...resource.spec },
          },
        });
      }
    } else {
      const resourceIdentity = {
        group: 'tesselar.io',
        version: 'v1',
        plural: 'authclients',
        namespace,
      };
      const result: unknown = await customObjectsApi()
        .getNamespacedCustomObject({ ...resourceIdentity, name })
        .catch((error: unknown) => {
          if (!isNotFound(error)) throw error;
          return undefined;
        });
      if (result === undefined) {
        await customObjectsApi().createNamespacedCustomObject({
          ...resourceIdentity,
          body: {
            ...resource,
            metadata: { ...resource.metadata, namespace },
          },
        });
      } else if (!isEqual(authClientSchema.parse(result), resource)) {
        const existing = storedAppSchema.parse(result);
        await customObjectsApi().replaceNamespacedCustomObject({
          ...resourceIdentity,
          name,
          body: {
            ...existing,
            metadata: { ...existing.metadata, ...resource.metadata, namespace },
            spec: resource.spec,
          },
        });
      }
    }
  }
}
