import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateApp } from './applications';
import { Volume } from 'memfs';
import YAML from 'yaml';
import { getAppConfig } from '../(dashboard)/apps/config';
import git, { PushResult } from 'isomorphic-git';
import { AppFormSchema } from '../(dashboard)/apps/formSchema';
import { setupMockGitRepo } from '../../test-utils';
import { baseDeployment } from '../../test-utils/fixtures';
import { produce } from 'immer';

vi.mock('server-only', () => ({}));

vi.mock('./k8s', () => ({
  customObjectsApi: vi.fn().mockReturnValue({
    patchNamespacedCustomObject: vi.fn(),
  }),
}));

vi.mock('../(dashboard)/apps/config', () => ({
  getAppConfig: vi.fn(),
}));

const gitPushMock = vi.spyOn(git, 'push').mockResolvedValue({
  ok: true,
  error: null,
  refs: {},
} satisfies PushResult);

describe('updateApp', () => {
  const mockGetAppConfig = vi.mocked(getAppConfig);

  beforeEach(async () => {
    mockGetAppConfig.mockReturnValue({
      PROJECT_DIR: '/test-project',
      CLUSTER_NAME: 'my-cluster',
      USER_NAME: 'Test User',
      USER_EMAIL: 'test@example.com',
      GITHUB_TOKEN: 'test-token',
      PUBLISH_MDNS_SERVICE: true,
      PORT: 3000,
    });

    vi.clearAllMocks();
  });

  it('updates the deployment file with new configuration', async () => {
    const appName = 'test-app';
    const mockFs = new Volume();

    const currentDeployment = produce(baseDeployment, (draft) => {
      draft.metadata.name = appName;
      draft.spec.template.spec.containers[0].image = 'old-image:1.0';

      // Starts with no env variables
      draft.spec.template.spec.containers[0].env = [];
    });

    mockFs.fromJSON({
      '/test-project/clusters/my-cluster/my-applications/test-app/deployment.yaml':
        YAML.stringify(currentDeployment),
    });

    await setupMockGitRepo({
      fs: mockFs,
      dir: '/test-project',
    });

    const newSpec = {
      name: appName,
      image: 'new-image:2.0', // Updated image
      // Add some env variables
      envVariables: [
        { name: 'API_KEY', value: 'secret-key' },
        { name: 'DEBUG', value: 'true' },
      ],
      resources: currentDeployment.spec.template.spec.containers[0].resources,
    } satisfies Partial<AppFormSchema>;

    await expect(updateApp(newSpec, mockFs)).resolves.toEqual({
      success: true,
    });

    const updatedDeploymentPath =
      '/test-project/clusters/my-cluster/my-applications/test-app/deployment.yaml';
    const updatedDeploymentContent = mockFs
      .readFileSync(updatedDeploymentPath, 'utf-8')
      .toString();
    const updatedDeployment = YAML.parse(updatedDeploymentContent);

    expect(updatedDeployment.spec.template.spec.containers[0].image).toBe(
      'new-image:2.0',
    );

    expect(updatedDeployment.spec.template.spec.containers[0].env).toEqual([
      { name: 'API_KEY', value: 'secret-key' },
      { name: 'DEBUG', value: 'true' },
    ]);

    expect(gitPushMock).toHaveBeenCalled();
  });
});
