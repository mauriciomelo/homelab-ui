import * as z from 'zod';
import { logger } from '@/lib/logger';
import {
  appStatusSchema,
  appSchema,
} from './schemas';
import * as k from './k8s';

const applicationsLogger = logger.child({ module: 'applications-api' });

export type AppRuntimeStatus = z.infer<typeof appStatusSchema>;

const liveAppSchema = appSchema.safeExtend({
  status: appStatusSchema,
});

export type LiveApp = z.infer<typeof liveAppSchema>;

export async function getLiveApps(): Promise<LiveApp[]> {
  try {
    const response = await k.customObjectsApi().listClusterCustomObject({
      group: 'tesselar.io',
      version: 'v1alpha1',
      plural: 'apps',
    });

    const parsedResponse = z
      .object({
        items: z.array(liveAppSchema),
      })
      .safeParse(response);

    if (parsedResponse.success) {
      return parsedResponse.data.items;
    }
  } catch (error) {
    if (!isKubernetesNotFoundError(error)) {
      throw error;
    }
  }

  return [];
}

export async function restartApp(name: string) {
  const patch = [
    {
      op: 'replace',
      path: '/spec/template/metadata/annotations',
      value: {
        'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
      },
    },
  ];
  await k.appsApi().patchNamespacedDeployment({
    name: name,
    namespace: name,
    body: patch,
  });
}

function isKubernetesNotFoundError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 404
  );
}

export async function reconcileFluxGitRepository({
  name,
  namespace,
}: {
  namespace: string;
  name: string;
}): Promise<void> {
  const patch = [
    {
      op: 'add',
      path: '/metadata/annotations',
      value: {
        'reconcile.fluxcd.io/requestedAt': new Date().toISOString(),
      },
    },
  ];

  try {
    await k.customObjectsApi().patchNamespacedCustomObject({
      namespace,
      group: 'source.toolkit.fluxcd.io',
      version: 'v1',
      plural: 'gitrepositories',
      name,
      body: patch,
    });

    applicationsLogger.info(
      { name, namespace, operation: 'reconcile-flux-git-repository' },
      'Triggered reconciliation for GitRepository',
    );
  } catch (err) {
    applicationsLogger.error(
      { err, name, namespace, operation: 'reconcile-flux-git-repository' },
      'Error triggering reconciliation',
    );
  }
}
