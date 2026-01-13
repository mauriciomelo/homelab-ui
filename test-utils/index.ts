import { Volume } from 'memfs';
import git from 'isomorphic-git';

export { server } from './mocks/node';

type SetupMockGitRepoOptions = {
  fs: InstanceType<typeof Volume>;
  dir: string;
  files?: Record<string, string>;
  remoteUrl?: string;
  defaultBranch?: string;
};

export async function setupMockGitRepo({
  fs,
  dir,
  remoteUrl = 'https://github.com/test/repo.git',
  defaultBranch = 'main',
}: SetupMockGitRepoOptions) {
  await git.init({
    fs,
    dir,
    defaultBranch,
  });

  const gitDir = `${dir}/.git`;
  await fs.promises.writeFile(
    `${gitDir}/HEAD`,
    `ref: refs/heads/${defaultBranch}`,
  );
  await fs.promises.mkdir(`${gitDir}/refs/heads`, { recursive: true });
  await fs.promises.writeFile(`${gitDir}/refs/heads/${defaultBranch}`, '');

  await git.addRemote({
    fs,
    dir,
    remote: 'origin',
    url: remoteUrl,
  });
}
