import * as k8s from '@kubernetes/client-node';
import { V1JSONSchemaProps } from '@kubernetes/client-node';
import assert from 'assert';
import { z } from 'zod';

import { toManifests } from './app-k8s-adapter';
import { apiextensionsV1Api, appsApi, coreApi, networkingApi } from './k8s';
import { appSchema, type AppSchema } from './schemas';

const group = 'tesselar.io';
const version = 'v1alpha1';
const plural = 'apps';
const managedByLabel = 'tesselar-app-controller';
const systemConfigName = 'tesselar-system-config';
const systemConfigNamespace = 'tesselar-system';
const openApiV3Schema = createOpenApiV3Schema();

function createOpenApiV3Schema(): V1JSONSchemaProps {
  const schema = z.toJSONSchema(appSchema, {
    io: 'input',
  });

  // @ts-expect-error - The types from @kubernetes/client-node are not fully compatible with the output of zod-to-json-schema
  return schema;
}

type WatchedApp = k8s.KubernetesObject & {
  apiVersion: 'tesselar.io/v1alpha1';
  kind: 'App';
  metadata: k8s.V1ObjectMeta;
  spec: AppSchema['spec'];
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

function isKubernetesError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export async function registerAppController() {
  await createCrdIfNotExists();
  watchApps();
}

async function createCrdIfNotExists() {
  const client = apiextensionsV1Api();

  try {
    await client.readCustomResourceDefinition({ name: crd.metadata!.name! });
  } catch (err: unknown) {
    if (isKubernetesError(err) && err.code === 404) {
      await client.createCustomResourceDefinition({ body: crd });
      return;
    }

    throw err;
  }
}

function watchApps() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const watch = new k8s.Watch(kc);

  watch.watch(
    `/apis/${group}/${version}/${plural}`,
    {},
    async (type, apiObj: WatchedApp) => {
      if (type === 'DELETED') {
        return;
      }

      await reconcileApp(apiObj);
    },
    (err) => {
      console.error(err);
    },
  );
}

async function reconcileApp(apiObj: WatchedApp) {
  const name = apiObj.metadata?.name;
  const namespace = apiObj.metadata?.namespace;
  const uid = apiObj.metadata?.uid;

  assert(typeof name === 'string', 'Name must be a string');
  assert(typeof namespace === 'string', 'Namespace must be a string');
  assert(typeof uid === 'string', 'UID must be a string');

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
}

async function getClusterDomain() {
  const configMap = await coreApi().readNamespacedConfigMap({
    name: systemConfigName,
    namespace: systemConfigNamespace,
  });

  const domain = configMap.data?.domain;

  assert(typeof domain === 'string' && domain.length > 0, 'Domain must be configured in tesselar-system-config ConfigMap');

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
      },
    },
  };
}

async function applyDeployment(deployment: k8s.V1Deployment) {
  const client = appsApi();
  const metadata = deployment.metadata;

  assert(metadata?.name, 'Deployment name must be defined');
  assert(metadata.namespace, 'Deployment namespace must be defined');

  try {
    const current = await client.readNamespacedDeployment({
      name: metadata.name,
      namespace: metadata.namespace,
    });

    await client.replaceNamespacedDeployment({
      name: metadata.name,
      namespace: metadata.namespace,
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
      await client.createNamespacedDeployment({
        namespace: metadata.namespace,
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

  try {
    const current = await client.readNamespacedService({
      name: metadata.name,
      namespace: metadata.namespace,
    });

    await client.replaceNamespacedService({
      name: metadata.name,
      namespace: metadata.namespace,
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
      await client.createNamespacedService({
        namespace: metadata.namespace,
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

  try {
    const current = await client.readNamespacedIngress({
      name: metadata.name,
      namespace: metadata.namespace,
    });

    await client.replaceNamespacedIngress({
      name: metadata.name,
      namespace: metadata.namespace,
      body: {
        ...ingress,
        metadata: {
          ...metadata,
          resourceVersion: current.metadata?.resourceVersion,
        },
      },
    });
  } catch (err: unknown) {
    if (isKubernetesError(err) && err.code === 404) {
      await client.createNamespacedIngress({
        namespace: metadata.namespace,
        body: ingress,
      });
      return;
    }

    throw err;
  }
}
