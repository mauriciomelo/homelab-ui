import * as k8s from '@kubernetes/client-node';
import { V1JSONSchemaProps } from '@kubernetes/client-node';
import assert from 'assert';
import isEqual from 'lodash/isEqual';
import { z } from 'zod';

import { APP_STATUS } from '@/app/constants';
import { logger } from '@/lib/logger';
import { toManifests } from './app-k8s-adapter';
import {
  apiextensionsV1Api,
  appsApi,
  coreApi,
  customObjectsApi,
  networkingApi,
} from './k8s';
import {
  appCrdSchema,
  appResourceSchema,
  appSchema,
  appStatusSchema,
  type AppSchema,
} from './schemas';

const group = 'tesselar.io';
const version = 'v1alpha1';
const plural = 'apps';
const managedByLabel = 'tesselar-app-controller';
const appNameLabel = 'app.kubernetes.io/name';
const systemConfigName = 'tesselar-system-config';
const systemConfigNamespace = 'tesselar-system';
const watchOptions = { allowWatchBookmarks: true };
const openApiV3Schema = createOpenApiV3Schema();
const reconcileQueue = new Map<string, Promise<void>>();
const appControllerLogger = logger.child({ controller: 'app-controller' });

type WatchedApp = k8s.KubernetesObject & {
  apiVersion: 'tesselar.io/v1alpha1';
  kind: 'App';
  metadata: k8s.V1ObjectMeta;
  spec: AppSchema['spec'];
  status?: z.infer<typeof appStatusSchema>;
};

const crd: k8s.V1CustomResourceDefinition = {
  apiVersion: 'apiextensions.k8s.io/v1',
  kind: 'CustomResourceDefinition',
  metadata: {
    name: `${plural}.${group}`,
  },
  spec: {
    group,
    versions: [
      {
        name: version,
        served: true,
        storage: true,
        schema: {
          openAPIV3Schema: openApiV3Schema,
        },
        subresources: {
          status: {},
        },
      },
    ],
    scope: 'Namespaced',
    names: {
      plural,
      singular: 'app',
      kind: 'App',
      shortNames: ['app'],
    },
  },
};

function createOpenApiV3Schema(): V1JSONSchemaProps {
  const schema = z.toJSONSchema(appCrdSchema, {
    io: 'input',
  });

  // @ts-expect-error zod JSON schema output is compatible at runtime
  return schema;
}

function isKubernetesError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export async function registerAppController() {
  appControllerLogger.info('Registering app controller');
  await createCrdIfNotExists();
  watchAppResources();
  appControllerLogger.info('App controller registered');
}

async function createCrdIfNotExists() {
  const client = apiextensionsV1Api();
  const crdLogger = appControllerLogger.child({
    operation: 'ensure-crd',
    crdName: crd.metadata!.name!,
  });

  try {
    const existing = await client.readCustomResourceDefinition({
      name: crd.metadata!.name!,
    });

    if (needsCrdUpdate(existing)) {
      crdLogger.info('Updating App CRD');
      await client.replaceCustomResourceDefinition({
        name: crd.metadata!.name!,
        body: {
          ...crd,
          metadata: {
            ...existing.metadata,
          },
        },
      });

      crdLogger.info('Updated App CRD');
      return;
    }

    crdLogger.debug('App CRD is up to date');
  } catch (err: unknown) {
    if (isKubernetesError(err) && err.code === 404) {
      crdLogger.info('Creating App CRD');
      await client.createCustomResourceDefinition({ body: crd });
      crdLogger.info('Created App CRD');
      return;
    }

    crdLogger.error({ err }, 'Failed to ensure App CRD');
    throw err;
  }
}

function needsCrdUpdate(existing: k8s.V1CustomResourceDefinition) {
  const existingVersions = existing.spec?.versions;

  if (!existingVersions) {
    return true;
  }

  const existingVersion = existingVersions.find(
    (item) => item.name === version,
  );

  return (
    existingVersion?.subresources?.status === undefined ||
    !isEqual(existingVersion.schema?.openAPIV3Schema, openApiV3Schema)
  );
}

function watchAppResources() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const watch = new k8s.Watch(kc);

  appControllerLogger.info('Starting resource watches');

  watchResource({
    watch,
    path: `/apis/${group}/${version}/${plural}`,
    onEvent: async (type, apiObj: WatchedApp) => {
      if (type === 'DELETED' || type === 'BOOKMARK' || !apiObj.metadata?.name) {
        return;
      }

      const eventLogger = appControllerLogger.child({
        eventType: type,
        ...getAppLogContext(apiObj),
      });

      if (!shouldReconcileApp(apiObj)) {
        eventLogger.debug('Skipping app reconcile because status is current');
        return;
      }

      const namespace = apiObj.metadata.namespace;
      const name = apiObj.metadata.name;

      if (!namespace) {
        return;
      }

      await runSerialized(`${namespace}/${name}`, async () => {
        eventLogger.info('Reconciling app resources');
        await reconcileApp(apiObj);
        await reconcileAppStatus({
          name,
          namespace,
          observedGeneration: apiObj.metadata.generation,
        });
        eventLogger.info('Reconciled app resources');
      });
    },
  });

  watchResource({
    watch,
    path: '/apis/apps/v1/deployments',
    onEvent: async (type, deployment: k8s.V1Deployment) => {
      if (
        type === 'DELETED' ||
        type === 'BOOKMARK' ||
        !deployment.metadata?.namespace
      ) {
        return;
      }

      const namespace = deployment.metadata.namespace;
      const name = deployment.metadata.name;

      if (!name) {
        return;
      }

      const eventLogger = appControllerLogger.child({
        eventType: type,
        name,
        namespace,
        resource: 'deployment',
      });

      await runSerialized(`${namespace}/${name}`, async () => {
        eventLogger.debug('Refreshing app status from deployment event');
        await reconcileAppStatus({
          name,
          namespace,
        });
      });
    },
  });

  watchResource({
    watch,
    path: '/api/v1/pods',
    onEvent: async (type, pod: k8s.V1Pod) => {
      if (
        type === 'DELETED' ||
        type === 'BOOKMARK' ||
        !pod.metadata?.namespace
      ) {
        return;
      }

      const namespace = pod.metadata.namespace;
      const name = pod.metadata.labels?.[appNameLabel] ?? pod.metadata.labels?.app;

      if (!name) {
        return;
      }

      const eventLogger = appControllerLogger.child({
        eventType: type,
        name,
        namespace,
        resource: 'pod',
      });

      await runSerialized(`${namespace}/${name}`, async () => {
        eventLogger.debug('Refreshing app status from pod event');
        await reconcileAppStatus({
          name,
          namespace,
        });
      });
    },
  });
}

async function runSerialized(key: string, operation: () => Promise<void>) {
  appControllerLogger.debug({ key }, 'Queueing serialized reconcile operation');
  const previous = reconcileQueue.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(operation)
    .finally(() => {
      if (reconcileQueue.get(key) === next) {
        reconcileQueue.delete(key);
      }
    });

  reconcileQueue.set(key, next);
  await next;
}

function watchResource<T extends k8s.KubernetesObject>({
  watch,
  path,
  onEvent,
}: {
  watch: k8s.Watch;
  path: string;
  onEvent: (type: string, obj: T) => Promise<void>;
}) {
  appControllerLogger.debug({ path }, 'Registering watch');
  watch.watch(
    path,
    watchOptions,
    async (type, apiObj: T) => {
      try {
        await onEvent(type, apiObj);
      } catch (error) {
        appControllerLogger.error(
          {
            err: error,
            path,
            eventType: type,
            ...getObjectLogContext(apiObj),
          },
          'Watch event handler failed',
        );
      }
    },
    (error) => {
      appControllerLogger.error({ err: error, path }, 'Watch stream failed');
    },
  );
}

function shouldReconcileApp(app: WatchedApp) {
  const observedGeneration = app.status?.observedGeneration;
  const generation = app.metadata?.generation;

  if (typeof generation !== 'number') {
    return true;
  }

  if (typeof observedGeneration !== 'number') {
    return true;
  }

  return observedGeneration < generation;
}

async function reconcileApp(apiObj: WatchedApp) {
  const name = apiObj.metadata?.name;
  const namespace = apiObj.metadata?.namespace;
  const uid = apiObj.metadata?.uid;

  assert(typeof name === 'string', 'Name must be a string');
  assert(typeof namespace === 'string', 'Namespace must be a string');
  assert(typeof uid === 'string', 'UID must be a string');

  const reconcileLogger = appControllerLogger.child({
    operation: 'reconcile-app',
    name,
    namespace,
    generation: apiObj.metadata?.generation,
  });

  const app = appSchema.parse({
    apiVersion: apiObj.apiVersion,
    kind: apiObj.kind,
    metadata: {
      name,
      annotations: apiObj.metadata.annotations,
    },
    spec: apiObj.spec,
  });

  const domain = await getClusterDomain();
  const { deployment, service, ingress } = toManifests(app);
  const ownerReferences: k8s.V1OwnerReference[] = [
    {
      apiVersion: apiObj.apiVersion,
      kind: apiObj.kind,
      name,
      uid,
      controller: true,
      blockOwnerDeletion: true,
    },
  ];

  await Promise.all([
    applyDeployment(
      withControlledMetadata(deployment, namespace, ownerReferences),
    ),
    applyService(withControlledMetadata(service, namespace, ownerReferences)),
    applyIngress(
      withControlledMetadata(
        {
          ...ingress,
          spec: {
            ...ingress.spec,
            rules: ingress.spec.rules.map((rule) => ({
              ...rule,
              host: `${name}.${domain}`,
            })),
          },
        },
        namespace,
        ownerReferences,
      ),
    ),
  ]);

  reconcileLogger.info({ domain }, 'Applied app runtime resources');
}

async function reconcileAppStatus({
  name,
  namespace,
  observedGeneration,
}: {
  name: string | undefined;
  namespace: string | undefined;
  observedGeneration?: number;
}) {
  const statusLogger = appControllerLogger.child({
    operation: 'reconcile-app-status',
    name,
    namespace,
    observedGeneration,
  });

  if (!name || !namespace || name !== namespace) {
    statusLogger.debug('Skipping status reconcile for non-app namespace mapping');
    return;
  }

  const appResource = await getAppResource(name, namespace);

  if (!appResource) {
    statusLogger.debug('Skipping status reconcile because app resource was not found');
    return;
  }

  const currentStatus = appStatusSchema.safeParse(appResource.status);
  const nextStatus = await buildAppStatus({
    name,
    namespace,
    observedGeneration:
      observedGeneration ??
      (currentStatus.success ? currentStatus.data.observedGeneration : undefined),
  });

  if (currentStatus.success && isEqual(currentStatus.data, nextStatus)) {
    statusLogger.debug('Skipping status update because status is unchanged');
    return;
  }

  const latestAppResource = await getAppResource(name, namespace);

  if (!latestAppResource) {
    statusLogger.debug('Skipping status update because latest app resource was not found');
    return;
  }

  const latestStatus = appStatusSchema.safeParse(latestAppResource.status);

  if (latestStatus.success && isEqual(latestStatus.data, nextStatus)) {
    statusLogger.debug('Skipping status update because latest status is unchanged');
    return;
  }

  await customObjectsApi().replaceNamespacedCustomObjectStatus({
    group,
    version,
    namespace,
    plural,
    name,
    body: {
      ...latestAppResource,
      status: nextStatus,
    },
  }).catch((error) => {
    if (isKubernetesError(error) && error.code === 404) {
      statusLogger.warn('Skipping status update because app resource disappeared');
      return;
    }

    throw error;
  });

  statusLogger.info({ phase: nextStatus.phase }, 'Updated app status');
}

async function getAppResource(name: string, namespace: string) {
  try {
    const resource = await customObjectsApi().getNamespacedCustomObject({
      group,
      version,
      namespace,
      plural,
      name,
    });

    appResourceSchema.parse(resource);

    return resource;
  } catch (error) {
    if (isKubernetesError(error) && error.code === 404) {
      appControllerLogger.debug(
        { name, namespace, operation: 'get-app-resource' },
        'App resource was not found',
      );
      return null;
    }

    throw error;
  }
}

async function buildAppStatus({
  name,
  namespace,
  observedGeneration,
}: {
  name: string;
  namespace: string;
  observedGeneration?: number;
}) {
  const [deployment, pods] = await Promise.all([
    readDeployment({ name, namespace }),
    coreApi().listNamespacedPod({ namespace }),
  ]);

  const deploymentConditions = (deployment?.status?.conditions ?? []).map(
    (condition) => ({
      type: condition.type,
      status: condition.status,
      lastTransitionTime: condition.lastTransitionTime?.toISOString(),
      reason: condition.reason,
      message: condition.message,
    }),
  );

  const desiredReplicas = deployment?.spec?.replicas ?? 1;
  const readyReplicas = deployment?.status?.readyReplicas ?? 0;
  const phase =
    deployment && readyReplicas >= desiredReplicas && desiredReplicas > 0
      ? APP_STATUS.RUNNING
      : APP_STATUS.PENDING;

  const placements = pods.items
    .filter((pod) => pod.metadata?.labels?.app === name)
    .map((pod) => ({
      nodeName: pod.spec?.nodeName,
    }))
    .filter(
      (placement, index, placementsList) =>
        placementsList.findIndex(
          (candidate) => candidate.nodeName === placement.nodeName,
        ) === index,
    );

  return appStatusSchema.parse({
    phase,
    observedGeneration,
    placements,
    conditions: deploymentConditions,
  });
}

async function getClusterDomain() {
  const configMap = await coreApi().readNamespacedConfigMap({
    name: systemConfigName,
    namespace: systemConfigNamespace,
  });

  const domain = configMap.data?.domain;

  assert(
    typeof domain === 'string' && domain.length > 0,
    'Domain must be configured in tesselar-system-config ConfigMap',
  );

  appControllerLogger.debug({ domain }, 'Loaded cluster domain');

  return domain;
}

function withControlledMetadata<T extends { metadata: k8s.V1ObjectMeta }>(
  resource: T,
  namespace: string,
  ownerReferences: k8s.V1OwnerReference[],
): T {
  return {
    ...resource,
    metadata: {
      ...resource.metadata,
      namespace,
      ownerReferences,
      labels: {
        ...resource.metadata.labels,
        'app.kubernetes.io/managed-by': managedByLabel,
        [appNameLabel]: resource.metadata.name,
      },
    },
  };
}

async function readDeployment({
  name,
  namespace,
}: {
  name: string;
  namespace: string;
}) {
  try {
    return await appsApi().readNamespacedDeployment({
      name,
      namespace,
    });
  } catch (error) {
    if (isKubernetesError(error) && error.code === 404) {
      appControllerLogger.debug(
        { name, namespace, operation: 'read-deployment' },
        'Deployment was not found',
      );
      return null;
    }

    throw error;
  }
}

async function applyDeployment(deployment: k8s.V1Deployment) {
  const client = appsApi();
  const metadata = deployment.metadata;
  const spec = deployment.spec;

  assert(metadata?.name, 'Deployment name must be defined');
  assert(metadata.namespace, 'Deployment namespace must be defined');
  assert(spec, 'Deployment spec must be defined');

  const name = metadata.name;
  const namespace = metadata.namespace;
  const deploymentLogger = appControllerLogger.child({
    operation: 'apply-deployment',
    name,
    namespace,
    resource: 'deployment',
  });

  const templateLabels = spec.template.metadata?.labels ?? {};
  spec.template.metadata = {
    ...spec.template.metadata,
    labels: {
      ...templateLabels,
      'app.kubernetes.io/managed-by': managedByLabel,
      [appNameLabel]: metadata.name,
    },
  };

  try {
    const current = await client.readNamespacedDeployment({
      name,
      namespace,
    });

    deploymentLogger.info('Replacing deployment');
    await client.replaceNamespacedDeployment({
      name,
      namespace,
      body: {
        ...deployment,
        metadata: {
          ...metadata,
          resourceVersion: current.metadata?.resourceVersion,
        },
      },
    });
  } catch (err: unknown) {
    if (isKubernetesError(err) && err.code === 404) {
      deploymentLogger.info('Creating deployment');
      await client.createNamespacedDeployment({
        namespace,
        body: deployment,
      });
      return;
    }

    throw err;
  }
}

async function applyService(service: k8s.V1Service) {
  const client = coreApi();
  const metadata = service.metadata;

  assert(metadata?.name, 'Service name must be defined');
  assert(metadata.namespace, 'Service namespace must be defined');

  const name = metadata.name;
  const namespace = metadata.namespace;
  const serviceLogger = appControllerLogger.child({
    operation: 'apply-service',
    name,
    namespace,
    resource: 'service',
  });

  try {
    const current = await client.readNamespacedService({
      name,
      namespace,
    });

    serviceLogger.info('Replacing service');
    await client.replaceNamespacedService({
      name,
      namespace,
      body: {
        ...service,
        metadata: {
          ...metadata,
          resourceVersion: current.metadata?.resourceVersion,
        },
      },
    });
  } catch (err: unknown) {
    if (isKubernetesError(err) && err.code === 404) {
      serviceLogger.info('Creating service');
      await client.createNamespacedService({
        namespace,
        body: service,
      });
      return;
    }

    throw err;
  }
}

async function applyIngress(ingress: k8s.V1Ingress) {
  const client = networkingApi();
  const metadata = ingress.metadata;

  assert(metadata?.name, 'Ingress name must be defined');
  assert(metadata.namespace, 'Ingress namespace must be defined');

  const name = metadata.name;
  const namespace = metadata.namespace;
  const ingressLogger = appControllerLogger.child({
    operation: 'apply-ingress',
    name,
    namespace,
    resource: 'ingress',
  });

  try {
    const current = await client.readNamespacedIngress({
      name,
      namespace,
    });

    ingressLogger.info('Replacing ingress');
    await client.replaceNamespacedIngress({
      name,
      namespace,
      body: {
        ...ingress,
        metadata: {
          ...metadata,
          resourceVersion: current.metadata?.resourceVersion,
        },
      },
    });
  } catch (error) {
    if (isKubernetesError(error) && error.code === 404) {
      ingressLogger.info('Creating ingress');
      await client.createNamespacedIngress({
        namespace,
        body: ingress,
      });
      return;
    }

    throw error;
  }
}

function getAppLogContext(app: WatchedApp) {
  return {
    name: app.metadata?.name,
    namespace: app.metadata?.namespace,
    generation: app.metadata?.generation,
  };
}

function getObjectLogContext(resource: k8s.KubernetesObject) {
  return {
    name: resource.metadata?.name,
    namespace: resource.metadata?.namespace,
  };
}
