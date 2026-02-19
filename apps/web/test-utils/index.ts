import git from 'isomorphic-git';
import { Volume } from 'memfs';

export { server } from './mocks/node';

type SetupMockGitRepoOptions = {
  dir: string;
  remoteUrl?: string;
  defaultBranch?: string;
  fs: Volume;
};

export async function setupMockGitRepo({
  dir,
  remoteUrl = 'https://github.com/test/repo.git',
  defaultBranch = 'main',
  fs,
}: SetupMockGitRepoOptions) {
  await git.init({
    fs,
    dir,
    defaultBranch,
  });

  await git.addRemote({
    fs: fs,
    dir,
    remote: 'origin',
    url: remoteUrl,
  });
}
