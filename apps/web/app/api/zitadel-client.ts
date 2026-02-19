import axios, { AxiosInstance } from 'axios';
import assert from 'assert';
import { coreApi } from './k8s';
import { getOptionalConfig } from '@/app/(dashboard)/apps/config';

const ZITADEL = {
  secretName: 'iam-admin-pat',
  namespace: 'zitadel',
  key: 'pat',
};

async function getZitadelApiToken() {
  const client = coreApi();
  const zitadelSecret = await client.readNamespacedSecret({
    name: ZITADEL.secretName,
    namespace: ZITADEL.namespace,
  });
  const zitadelPat = zitadelSecret.data?.[ZITADEL.key];

  const decodedPat = Buffer.from(zitadelPat || '', 'base64')
    .toString('utf-8')
    .trim();

  return decodedPat;
}

export class ZitadelClient {
  private axiosInstance: AxiosInstance;

  private constructor(axiosInstance: AxiosInstance) {
    this.axiosInstance = axiosInstance;
  }

  static async create() {
    const token = await getZitadelApiToken();
    assert(token, 'Zitadel PAT is required to create auth clients');

    const { ZITADEL_URL } = getOptionalConfig();
    const axiosInstance = axios.create({
      baseURL: ZITADEL_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    return new ZitadelClient(axiosInstance);
  }

  async getOrgByName({ name }: { name: string }) {
    const res = await this.axiosInstance.post<{
      organizations: { id: string }[];
    }>('/zitadel.org.v2beta.OrganizationService/ListOrganizations', {
      filter: [
        {
          nameFilter: {
            name,
            method: 'TEXT_QUERY_METHOD_EQUALS',
          },
        },
      ],
    });

    return res.data.organizations[0];
  }

  async getProjectByName({ name }: { name: string }) {
    const res = await this.axiosInstance.post<{ projects: { id: string }[] }>(
      '/zitadel.project.v2beta.ProjectService/ListProjects',
      {
        filters: [
          {
            projectNameFilter: {
              projectName: name,
              method: 'TEXT_FILTER_METHOD_EQUALS',
            },
          },
        ],
      },
    );

    return res.data.projects[0];
  }

  async createApplication({
    name,
    projectId,
    orgId,
    redirectUris,
    postLogoutRedirectUris,
  }: {
    name: string;
    projectId: string;
    orgId: string;
    redirectUris: string[];
    postLogoutRedirectUris?: string[];
  }) {
    const res = await this.axiosInstance.post(
      `/management/v1/projects/${projectId}/apps/oidc`,
      {
        name: name,
        redirectUris,
        responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
        grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
        appType: 'OIDC_APP_TYPE_WEB',
        authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
        postLogoutRedirectUris,
      },
      {
        headers: {
          'x-zitadel-orgid': orgId,
        },
      },
    );

    const { clientId, clientSecret } = res.data;

    assert(typeof clientId === 'string', 'clientId must be a string');
    assert(typeof clientSecret === 'string', 'clientSecret must be a string');

    return { clientId, clientSecret };
  }

  async getApplicationByName({
    name,
    projectId,
    orgId,
  }: {
    name: string;
    projectId: string;
    orgId: string;
  }) {
    const res = await this.axiosInstance.post<{ result: { id: string }[] }>(
      `/management/v1/projects/${projectId}/apps/_search`,
      {
        queries: [
          {
            nameQuery: {
              name: name,
              method: 'TEXT_QUERY_METHOD_EQUALS',
            },
          },
        ],
      },
      {
        headers: {
          'x-zitadel-orgid': orgId,
        },
      },
    );

    return res.data.result[0];
  }

  async deleteApplication({
    id,
    projectId,
    orgId,
  }: {
    id: string;
    projectId: string;
    orgId: string;
  }) {
    await this.axiosInstance.delete(
      `/management/v1/projects/${projectId}/apps/${id}`,
      {
        headers: {
          'x-zitadel-orgid': orgId,
        },
      },
    );
  }
}
