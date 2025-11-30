import { describe, it, expect, vi, beforeEach } from 'vitest';
import { server } from '@/test-utils';
import { http, HttpResponse } from 'msw';
import { registerAuthClientController } from './auth-controller';
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
  return {
    ...mod,
    KubeConfig: vi.fn(() => ({
      loadFromDefault: vi.fn(),
      makeApiClient: vi.fn((c) => {
        if (c === mod.ApiextensionsV1Api) {
          return mockApiextensionsV1ApiClient;
        }
        if (c === mod.CoreV1Api) {
          return mockCoreApiClient;
        }
        return {};
      }),
    })),
    Watch: vi.fn(() => mockWatch),
  };
});

describe('registerAuthClientController', () => {
  beforeEach(async () => {
    server.listen();
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
    const error = new Error('Kubernetes API error');
    (error as any).code = 500; // Add a code property to simulate an HTTP error code
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
        ({ params }) => {
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
});
