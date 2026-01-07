import * as k8s from '@kubernetes/client-node';
import { V1Secret, V1JSONSchemaProps } from '@kubernetes/client-node';
import { apiextensionsV1Api, coreApi } from './k8s';
import assert from 'assert';
import { ZitadelClient } from './zitadel-client';
import * as z from 'zod';

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
  console.log('Ensuring AuthClient CRD exists...');
  const client = apiextensionsV1Api();
  try {
    await client.readCustomResourceDefinition({ name: crd.metadata!.name! });
    console.log('AuthClient CRD already exists');
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).code === 404) {
      console.log('AuthClient CRD does not exist, creating...');
      await client.createCustomResourceDefinition({ body: crd });
      console.log('AuthClient CRD created');
    } else {
      throw err;
    }
  }
}

function watchAuthClients() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const watch = new k8s.Watch(kc);
  watch.watch(
    `/apis/${group}/${version}/${plural}`,
    {},
    async (type, apiObj: AuthClient) => {
      const name = apiObj?.metadata?.name;
      const namespace = apiObj?.metadata?.namespace;

      assert(typeof name === 'string', 'Name must be a string');
      assert(typeof namespace === 'string', 'Namespace must be a string');

      const oicdApplicationName = `${namespace}-${name}`;

      const zitadel = await ZitadelClient.create();

      const { id: orgId } = await zitadel.getOrgByName({
        name: ZITADEL.orgName,
      });
      const { id: projectId } = await zitadel.getProjectByName({
        name: ZITADEL.projectName,
      });

      assert(typeof orgId === 'string', 'orgId must be a string');
      assert(typeof projectId === 'string', 'projectId must be a string');

      if (type === 'ADDED') {
        const exists = await secretExists({ name, namespace });
        if (exists) {
          console.log(
            `AuthClient secret already exists for ${namespace}/${name}, skipping creation`,
          );
          return;
        }

        console.log(`Creating AuthClient for ${namespace}/${name}...`);

        const { clientId, clientSecret } = await zitadel.createApplication({
          name: oicdApplicationName,
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

        console.log('AuthClient created:', name);
      } else if (type === 'DELETED') {
        const application = await zitadel.getApplicationByName({
          name: oicdApplicationName,
          projectId,
          orgId,
        });

        console.log(
          `Deleting AuthClient for ${namespace}/${name}... id: ${application.id}`,
        );

        await zitadel.deleteApplication({
          id: application.id,
          projectId,
          orgId,
        });

        await deleteSecret({ name, namespace });
        console.log('AuthClient deleted:', name);
      }
    },
    (err) => {
      console.error(err);
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
  try {
    await client.readNamespacedSecret({ name, namespace });
    return true;
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).code === 404) {
      return false;
    }
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
  await createCrdIfNotExists();
  watchAuthClients();
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
}

function deleteSecret({
  name,
  namespace,
}: {
  name: string;
  namespace: string;
}) {
  const client = coreApi();

  return client.deleteNamespacedSecret({
    name,
    namespace,
  });
}
