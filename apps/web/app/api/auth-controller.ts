import * as k8s from '@kubernetes/client-node';
import { V1Secret, V1JSONSchemaProps } from '@kubernetes/client-node';
import assert from 'assert';
import * as z from 'zod';

import { logger } from '@/lib/logger';
import { apiextensionsV1Api, coreApi } from './k8s';
import { ZitadelClient } from './zitadel-client';

const group = 'tesselar.io';
const version = 'v1';
const plural = 'authclients';

const ZITADEL = {
  secretName: 'iam-admin-pat',
  namespace: 'zitadel',
  orgName: 'tesselar_org',
  projectName: 'Tesselar Apps',
  key: 'pat',
};
const authControllerLogger = logger.child({ controller: 'auth-controller' });

function isKubernetesError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

const authClientSchema = z.object({
  spec: z.object({
    redirectUris: z.array(z.string()),
    postLogoutRedirectUris: z.array(z.string()).optional(),
  }),
});

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
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          openAPIV3Schema: z.toJSONSchema(
            authClientSchema,
          ) as V1JSONSchemaProps,
        },
      },
    ],
    scope: 'Namespaced',
    names: {
      plural,
      singular: 'authclient',
      kind: 'AuthClient',
      shortNames: ['ac'],
    },
  },
};

async function createCrdIfNotExists() {
  const client = apiextensionsV1Api();
  const crdLogger = authControllerLogger.child({
    operation: 'ensure-crd',
    crdName: crd.metadata!.name!,
  });

  try {
    await client.readCustomResourceDefinition({ name: crd.metadata!.name! });
    crdLogger.debug('AuthClient CRD already exists');
  } catch (err: unknown) {
    if (isKubernetesError(err) && err.code === 404) {
      crdLogger.info('Creating AuthClient CRD');
      await client.createCustomResourceDefinition({ body: crd });
      crdLogger.info('Created AuthClient CRD');
    } else {
      crdLogger.error({ err }, 'Failed to ensure AuthClient CRD');
      throw err;
    }
  }
}

function watchAuthClients() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const watch = new k8s.Watch(kc);

  authControllerLogger.info('Starting AuthClient watch');

  void watch.watch(
    `/apis/${group}/${version}/${plural}`,
    {},
    async (type, apiObj: AuthClient) => {
      const name = apiObj.metadata?.name;
      const namespace = apiObj.metadata?.namespace;
      const eventLogger = authControllerLogger.child({
        eventType: type,
        name,
        namespace,
      });

      try {
        assert(typeof name === 'string', 'Name must be a string');
        assert(typeof namespace === 'string', 'Namespace must be a string');

        const oidcApplicationName = `${namespace}-${name}`;

        if (type !== 'ADDED' && type !== 'DELETED') {
          eventLogger.debug('Ignoring AuthClient event');
          return;
        }

        eventLogger.info('Reconciling AuthClient event');

        const zitadel = await ZitadelClient.create();

        const { id: orgId } = await zitadel.getOrgByName({
          name: ZITADEL.orgName,
        });
        const { id: projectId } = await zitadel.getProjectByName({
          name: ZITADEL.projectName,
        });

        assert(typeof orgId === 'string', 'orgId must be a string');
        assert(typeof projectId === 'string', 'projectId must be a string');

        const zitadelLogger = eventLogger.child({ orgId, projectId });

        if (type === 'ADDED') {
          const exists = await secretExists({ name, namespace });
          if (exists) {
            zitadelLogger.debug(
              'Skipping AuthClient creation because secret already exists',
            );
            return;
          }

          zitadelLogger.info('Creating AuthClient application');

          const { clientId, clientSecret } = await zitadel.createApplication({
            name: oidcApplicationName,
            projectId,
            orgId,
            redirectUris: apiObj.spec.redirectUris,
            postLogoutRedirectUris: apiObj.spec.postLogoutRedirectUris,
          });

          await createSecret({
            name,
            namespace,
            secretData: {
              clientId,
              clientSecret,
            },
          });

          zitadelLogger.info('Created AuthClient application and secret');
          return;
        }

        const application = await zitadel.getApplicationByName({
          name: oidcApplicationName,
          projectId,
          orgId,
        });

        zitadelLogger.info(
          { applicationId: application.id },
          'Deleting AuthClient application',
        );

        await zitadel.deleteApplication({
          id: application.id,
          projectId,
          orgId,
        });

        await deleteSecret({ name, namespace });
        zitadelLogger.info(
          { applicationId: application.id },
          'Deleted AuthClient application and secret',
        );
      } catch (err) {
        eventLogger.error({ err }, 'AuthClient watch handler failed');
        throw err;
      }
    },
    (err) => {
      authControllerLogger.error({ err }, 'AuthClient watch stream failed');
    },
  );
}

async function secretExists({
  name,
  namespace,
}: {
  name: string;
  namespace: string;
}): Promise<boolean> {
  const client = coreApi();
  const secretLogger = authControllerLogger.child({
    operation: 'secret-exists',
    name,
    namespace,
  });

  try {
    await client.readNamespacedSecret({ name, namespace });
    secretLogger.debug('AuthClient secret already exists');
    return true;
  } catch (err: unknown) {
    if (isKubernetesError(err) && err.code === 404) {
      secretLogger.debug('AuthClient secret does not exist yet');
      return false;
    }

    secretLogger.error({ err }, 'Failed to read AuthClient secret');
    throw err;
  }
}

interface AuthClient extends k8s.KubernetesObject {
  spec: {
    redirectUris: string[];
    postLogoutRedirectUris: string[];
  };
}

export async function registerAuthClientController() {
  authControllerLogger.info('Registering AuthClient controller');
  await createCrdIfNotExists();
  watchAuthClients();
  authControllerLogger.info('AuthClient controller registered');
}

async function createSecret({
  name,
  namespace,
  secretData,
}: {
  name: string;
  namespace: string;
  secretData: { clientId: string; clientSecret: string };
}) {
  const client = coreApi();
  const secretLogger = authControllerLogger.child({
    operation: 'create-secret',
    name,
    namespace,
  });
  const body: V1Secret = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name,
      namespace,
    },
    stringData: {
      'client-id': secretData.clientId,
      'client-secret': secretData.clientSecret,
    },
  };
  await client.createNamespacedSecret({
    body,
    namespace,
  });

  secretLogger.info('Created AuthClient secret');
}

function deleteSecret({
  name,
  namespace,
}: {
  name: string;
  namespace: string;
}) {
  const client = coreApi();
  const secretLogger = authControllerLogger.child({
    operation: 'delete-secret',
    name,
    namespace,
  });

  return client
    .deleteNamespacedSecret({
      name,
      namespace,
    })
    .then(() => {
      secretLogger.info('Deleted AuthClient secret');
    });
}
