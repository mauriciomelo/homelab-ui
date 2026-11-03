import { describe, it, expect, vi, beforeEach } from 'vitest';
import { server } from '@/test-utils';
import { http, HttpResponse } from 'msw';
import { produce } from 'immer';
import type { AuthClientSchema } from './schemas/auth-client-schema';
import {
  registerAuthClientController,
  stopAuthClientController,
} from './auth-controller';
import * as k8s from '@kubernetes/client-node';
import { getOptionalConfig } from '@/app/(dashboard)/apps/config';

const ZITADEL_URL = getOptionalConfig().ZITADEL_URL;

const { mockApiextensionsV1ApiClient, mockCoreApiClient, mockWatch } =
  vi.hoisted(() => {
    return {
      mockApiextensionsV1ApiClient: {
        readCustomResourceDefinition: vi.fn(),
        createCustomResourceDefinition: vi.fn(),
      },
      mockCoreApiClient: {
        readNamespacedSecret: vi.fn(),
        createNamespacedSecret: vi.fn(),
        deleteNamespacedSecret: vi.fn(),
      },
      mockWatch: {
        watch: vi.fn(),
      },
    };
  });

vi.mock('@kubernetes/client-node', async (importOriginal) => {
  const mod = await importOriginal<typeof k8s>();
  class MockKubeConfig {
    loadFromDefault = vi.fn();
    makeApiClient = vi.fn((c) => {
      if (c === mod.ApiextensionsV1Api) {
        return mockApiextensionsV1ApiClient;
      }
      if (c === mod.CoreV1Api) {
        return mockCoreApiClient;
      }
      return {};
    });
  }
  return {
    ...mod,
    KubeConfig: MockKubeConfig,
    Watch: vi.fn().mockImplementation(function () {
      return mockWatch;
    }),
  };
});

const baseAuthClient: {
  metadata: { name: string; namespace: string };
  spec: AuthClientSchema['spec'];
} = {
  metadata: { name: 'my-auth-client', namespace: 'default' },
  spec: {
    redirectUris: ['https://example.com/callback'],
    postLogoutRedirectUris: ['https://example.com/logout'],
  },
};

const existingOidcConfiguration = {
  ...baseAuthClient.spec,
  clientId: 'existing-client-id',
  version: 'OIDC_VERSION_1_0',
  noneCompliant: false,
  complianceProblems: [],
  allowedOrigins: ['https://example.com'],
  responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
  grantTypes: [
    'OIDC_GRANT_TYPE_AUTHORIZATION_CODE',
    'OIDC_GRANT_TYPE_REFRESH_TOKEN',
  ],
  appType: 'OIDC_APP_TYPE_WEB',
  authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
  devMode: false,
  accessTokenType: 'OIDC_TOKEN_TYPE_JWT',
  accessTokenRoleAssertion: true,
  idTokenRoleAssertion: true,
  idTokenUserinfoAssertion: true,
  clockSkew: '5s',
  additionalOrigins: ['https://another.example.com'],
  skipNativeAppSuccessPage: true,
  backChannelLogoutUri: 'https://example.com/backchannel',
};

function useExistingSecret() {
  mockCoreApiClient.readNamespacedSecret.mockImplementation(async (args) => {
    if (args.name === 'iam-admin-pat' && args.namespace === 'zitadel') {
      return { data: { pat: Buffer.from('fake-pat').toString('base64') } };
    }
    if (args.name === 'my-auth-client' && args.namespace === 'default') {
      return {
        metadata: { uid: 'existing-secret-uid' },
        data: {
          'client-id': Buffer.from('existing-client-id').toString('base64'),
          'client-secret': Buffer.from('existing-client-secret').toString(
            'base64',
          ),
        },
      };
    }
    throw { code: 404 };
  });
}

describe('registerAuthClientController', () => {
  beforeEach(async () => {
    // server.listen();
    vi.clearAllMocks();

    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockReset();
    mockApiextensionsV1ApiClient.createCustomResourceDefinition.mockReset();
    mockCoreApiClient.readNamespacedSecret.mockReset();
    mockCoreApiClient.createNamespacedSecret.mockReset();
    mockCoreApiClient.deleteNamespacedSecret.mockReset();
    mockWatch.watch.mockReset();

    mockCoreApiClient.readNamespacedSecret.mockImplementation(async (args) => {
      if (args.name === 'iam-admin-pat' && args.namespace === 'zitadel') {
        return {
          data: {
            pat: Buffer.from('fake-pat').toString('base64'),
          },
        };
      }
      throw { code: 404 };
    });

    server.use(
      http.post(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/_search`,
        () => HttpResponse.json({ result: [{ id: 'app-id' }] }),
      ),
      http.get(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/app-id`,
        () =>
          HttpResponse.json({ app: { oidcConfig: existingOidcConfiguration } }),
      ),
      http.post(
        `${ZITADEL_URL}/zitadel.org.v2beta.OrganizationService/ListOrganizations`,
        () => {
          return HttpResponse.json({
            organizations: [{ id: 'org-id' }],
          });
        },
      ),
      http.post(
        `${ZITADEL_URL}/zitadel.project.v2beta.ProjectService/ListProjects`,
        () => {
          return HttpResponse.json({
            projects: [{ id: 'project-id' }],
          });
        },
      ),
    );
  });

  it('creates the AuthClient CRD if it does not exist', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockRejectedValue(
      {
        body: {
          message: 'not found',
          reason: 'NotFound',
        },
        code: 404,
      },
    );
    mockApiextensionsV1ApiClient.createCustomResourceDefinition.mockResolvedValue(
      {},
    );

    await registerAuthClientController();

    expect(
      mockApiextensionsV1ApiClient.readCustomResourceDefinition,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockApiextensionsV1ApiClient.createCustomResourceDefinition,
    ).toHaveBeenCalledWith({
      body: {
        apiVersion: 'apiextensions.k8s.io/v1',
        kind: 'CustomResourceDefinition',
        metadata: {
          name: 'authclients.tesselar.io',
        },
        spec: {
          group: 'tesselar.io',
          versions: [
            {
              name: 'v1',
              served: true,
              storage: true,
              schema: {
                openAPIV3Schema: {
                  $schema: 'https://json-schema.org/draft/2020-12/schema',
                  additionalProperties: false,
                  type: 'object',
                  properties: {
                    spec: {
                      additionalProperties: false,
                      type: 'object',
                      properties: {
                        redirectUris: {
                          type: 'array',
                          items: {
                            type: 'string',
                          },
                        },
                        postLogoutRedirectUris: {
                          type: 'array',
                          items: {
                            type: 'string',
                          },
                        },
                      },
                      required: ['redirectUris'],
                    },
                  },
                  required: ['spec'],
                },
              },
            },
          ],
          scope: 'Namespaced',
          names: {
            plural: 'authclients',
            singular: 'authclient',
            kind: 'AuthClient',
            shortNames: ['ac'],
          },
        },
      },
    });
  });

  it('does not create the AuthClient CRD if it already exists', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockResolvedValue(
      {},
    );
    mockApiextensionsV1ApiClient.createCustomResourceDefinition.mockResolvedValue(
      {},
    );

    await registerAuthClientController();

    expect(
      mockApiextensionsV1ApiClient.readCustomResourceDefinition,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockApiextensionsV1ApiClient.createCustomResourceDefinition,
    ).not.toHaveBeenCalled();
  });

  it('throws an error if reading CRD fails for reasons other than 404', async () => {
    const error = Object.assign(new Error('Kubernetes API error'), {
      code: 500,
    });
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockRejectedValue(
      error,
    );

    await expect(registerAuthClientController()).rejects.toThrow(error);
    expect(
      mockApiextensionsV1ApiClient.readCustomResourceDefinition,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockApiextensionsV1ApiClient.createCustomResourceDefinition,
    ).not.toHaveBeenCalled();
  });

  it('handles ADDED event: creates Zitadel app and secret if secret does not exist', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockResolvedValue(
      {},
    );

    mockCoreApiClient.readNamespacedSecret.mockImplementation(async (args) => {
      if (args.name === 'iam-admin-pat' && args.namespace === 'zitadel') {
        return {
          data: {
            pat: Buffer.from('fake-pat').toString('base64'),
          },
        };
      }
      throw { code: 404 };
    });

    mockCoreApiClient.createNamespacedSecret.mockResolvedValue({});

    const zitadelRequestSpy = vi.fn();

    server.use(
      http.post(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/oidc`,
        async ({ request }) => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
          const body = (await request.json()) as any;

          zitadelRequestSpy(body);
          if (
            body.name !== 'default-my-auth-client' ||
            request.headers.get('x-zitadel-orgid') !== 'org-id'
          ) {
            return new HttpResponse(null, { status: 400 });
          }

          return HttpResponse.json({
            clientId: 'client-id',
            clientSecret: 'client-secret',
          });
        },
      ),
    );

    await registerAuthClientController();

    expect(mockWatch.watch).toHaveBeenCalledTimes(1);
    // Get the callback function (3rd argument: callback(type, apiObj))
    const watchCallback = mockWatch.watch.mock.calls[0][2];

    const apiObj = {
      metadata: {
        name: 'my-auth-client',
        namespace: 'default',
      },
      spec: {
        redirectUris: ['https://example.com/callback'],
        postLogoutRedirectUris: ['https://example.com/logout'],
      },
    };
    await watchCallback('ADDED', apiObj);

    expect(mockCoreApiClient.readNamespacedSecret).toHaveBeenCalledWith({
      name: 'my-auth-client',
      namespace: 'default',
    });

    expect(zitadelRequestSpy).toHaveBeenCalledWith({
      name: 'default-my-auth-client',
      appType: 'OIDC_APP_TYPE_WEB',
      authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
      grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
      redirectUris: ['https://example.com/callback'],
      postLogoutRedirectUris: ['https://example.com/logout'],
      responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
    });

    expect(mockCoreApiClient.createNamespacedSecret).toHaveBeenCalledWith({
      body: expect.objectContaining({
        metadata: {
          name: 'my-auth-client',
          namespace: 'default',
        },
        stringData: {
          'client-id': 'client-id',
          'client-secret': 'client-secret',
        },
      }),
      namespace: 'default',
    });
  });

  it('creates a client on MODIFIED when the credentials Secret is missing', async () => {
    const apiObj = produce(baseAuthClient, () => {});
    server.use(
      http.post(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/oidc`,
        () => HttpResponse.json({ clientId: 'client-id', clientSecret: 'client-secret' }),
      ),
    );

    await registerAuthClientController();
    await mockWatch.watch.mock.calls[0][2]('MODIFIED', apiObj);

    expect(mockCoreApiClient.createNamespacedSecret).toHaveBeenCalledExactlyOnceWith({
      namespace: 'default',
      body: expect.objectContaining({
        metadata: { name: 'my-auth-client', namespace: 'default' },
        stringData: { 'client-id': 'client-id', 'client-secret': 'client-secret' },
      }),
    });
  });

  it.each(['ADDED', 'MODIFIED'])(
    'reconciles existing URI lists on %s without changing credentials or other OIDC settings',
    async (event) => {
      useExistingSecret();
      const apiObj = produce(baseAuthClient, (draft) => {
        draft.spec.redirectUris = ['https://new.example.com/callback'];
        draft.spec.postLogoutRedirectUris = ['https://new.example.com/logout'];
      });
      const updateRequest = vi.fn();
      server.use(
        http.put(
          `${ZITADEL_URL}/management/v1/projects/project-id/apps/app-id/oidc_config`,
          async ({ request }) => {
            updateRequest(
              await request.json(),
              request.headers.get('x-zitadel-orgid'),
            );
            return HttpResponse.json({});
          },
        ),
      );

      await registerAuthClientController();
      await mockWatch.watch.mock.calls[0][2](event, apiObj);

      expect(updateRequest).toHaveBeenCalledExactlyOnceWith(
        {
          ...apiObj.spec,
          responseTypes: existingOidcConfiguration.responseTypes,
          grantTypes: existingOidcConfiguration.grantTypes,
          appType: existingOidcConfiguration.appType,
          authMethodType: existingOidcConfiguration.authMethodType,
          devMode: existingOidcConfiguration.devMode,
          accessTokenType: existingOidcConfiguration.accessTokenType,
          accessTokenRoleAssertion:
            existingOidcConfiguration.accessTokenRoleAssertion,
          idTokenRoleAssertion: existingOidcConfiguration.idTokenRoleAssertion,
          idTokenUserinfoAssertion:
            existingOidcConfiguration.idTokenUserinfoAssertion,
          clockSkew: existingOidcConfiguration.clockSkew,
          additionalOrigins: existingOidcConfiguration.additionalOrigins,
          skipNativeAppSuccessPage:
            existingOidcConfiguration.skipNativeAppSuccessPage,
          backChannelLogoutUri: existingOidcConfiguration.backChannelLogoutUri,
        },
        'org-id',
      );
      expect(mockCoreApiClient.createNamespacedSecret).not.toHaveBeenCalled();
      expect(mockCoreApiClient.deleteNamespacedSecret).not.toHaveBeenCalled();
    },
  );

  it.each(['ADDED', 'MODIFIED'])(
    'skips unchanged URI lists on %s',
    async (event) => {
      useExistingSecret();
      const apiObj = produce(baseAuthClient, () => {});
      const updateRequest = vi.fn();
      server.use(
        http.put(
          `${ZITADEL_URL}/management/v1/projects/project-id/apps/app-id/oidc_config`,
          () => {
            updateRequest();
            return HttpResponse.json({});
          },
        ),
      );

      await registerAuthClientController();
      await mockWatch.watch.mock.calls[0][2](event, apiObj);

      expect(updateRequest).not.toHaveBeenCalled();
      expect(mockCoreApiClient.createNamespacedSecret).not.toHaveBeenCalled();
      expect(mockCoreApiClient.deleteNamespacedSecret).not.toHaveBeenCalled();
    },
  );

  it.each([
    { description: 'omitted', uris: undefined },
    { description: 'empty', uris: [] },
  ])('clears logout URLs when the list is $description', async ({ uris }) => {
    useExistingSecret();
    const apiObj = produce(baseAuthClient, (draft) => {
      if (uris === undefined) delete draft.spec.postLogoutRedirectUris;
      else draft.spec.postLogoutRedirectUris = uris;
    });
    const updateRequest = vi.fn();
    server.use(
      http.put(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/app-id/oidc_config`,
        async ({ request }) => {
          updateRequest(await request.json());
          return HttpResponse.json({});
        },
      ),
    );

    await registerAuthClientController();
    await mockWatch.watch.mock.calls[0][2]('MODIFIED', apiObj);

    expect(updateRequest).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        redirectUris: baseAuthClient.spec.redirectUris,
        postLogoutRedirectUris: [],
      }),
    );
    expect(mockCoreApiClient.createNamespacedSecret).not.toHaveBeenCalled();
    expect(mockCoreApiClient.deleteNamespacedSecret).not.toHaveBeenCalled();
  });

  it('reports a missing Zitadel application without replacing existing credentials', async () => {
    useExistingSecret();
    const apiObj = produce(baseAuthClient, () => {});
    server.use(
      http.post(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/_search`,
        () => HttpResponse.json({ result: [] }),
      ),
    );

    await registerAuthClientController();

    await expect(
      mockWatch.watch.mock.calls[0][2]('MODIFIED', apiObj),
    ).rejects.toThrow(
      'Zitadel application "default-my-auth-client" was not found',
    );
    expect(mockCoreApiClient.createNamespacedSecret).not.toHaveBeenCalled();
    expect(mockCoreApiClient.deleteNamespacedSecret).not.toHaveBeenCalled();
  });

  it('handles DELETED event: deletes Zitadel app and secret', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockResolvedValue(
      {},
    );

    const deletedIds: string[] = [];
    server.use(
      http.post(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/_search`,
        () => {
          return HttpResponse.json({
            result: [{ id: 'app-id' }],
          });
        },
      ),
      http.delete(
        `${ZITADEL_URL}/management/v1/projects/project-id/apps/app-id`,
        () => {
          deletedIds.push('app-id');
          return new HttpResponse(null, { status: 200 });
        },
      ),
    );

    mockCoreApiClient.deleteNamespacedSecret.mockResolvedValue({});

    await registerAuthClientController();

    const watchCallback = mockWatch.watch.mock.calls[0][2];

    const apiObj = {
      metadata: {
        name: 'my-auth-client',
        namespace: 'default',
      },
    };
    await watchCallback('DELETED', apiObj);

    expect(deletedIds).toContain('app-id');

    expect(mockCoreApiClient.deleteNamespacedSecret).toHaveBeenCalledWith({
      name: 'my-auth-client',
      namespace: 'default',
    });
  });

  it('reconnects when the AuthClient watch closes and aborts on shutdown', async () => {
    mockApiextensionsV1ApiClient.readCustomResourceDefinition.mockResolvedValue(
      {},
    );
    const abortSpy = vi.fn();
    mockWatch.watch.mockResolvedValue({ abort: abortSpy });

    await registerAuthClientController();

    expect(mockWatch.watch).toHaveBeenCalledTimes(1);

    const onWatchDone = mockWatch.watch.mock.calls[0][3];
    onWatchDone(new Error('Watch stream reset'));

    expect(mockWatch.watch).toHaveBeenCalledTimes(2);

    await Promise.resolve();
    stopAuthClientController();

    expect(abortSpy).toHaveBeenCalledOnce();

    const onWatchDoneAfterStop = mockWatch.watch.mock.calls[1][3];
    onWatchDoneAfterStop(new Error('Closed on shutdown'));

    expect(mockWatch.watch).toHaveBeenCalledTimes(2);
  });
});
