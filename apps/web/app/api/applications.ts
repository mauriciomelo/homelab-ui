import { APP_STATUS } from '@/app/constants';
import { EventEmitter, on } from 'node:events';
import * as z from 'zod';
import { logger } from '@/lib/logger';
import {
  appStatusSchema,
  appSchema,
} from './schemas';
import * as k from './k8s';

const applicationsLogger = logger.child({ module: 'applications-api' });

export type AppRuntimeStatus = z.infer<typeof appStatusSchema>;

export const liveAppSchema = appSchema.safeExtend({
  status: appStatusSchema.default({ phase: APP_STATUS.UNKNOWN, placements: [], conditions: [] }),
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

    applicationsLogger.error(
      {
        appCount: getResponseItemCount(response),
        validationIssues: parsedResponse.error.issues.map((issue) => ({
          path: issue.path.length > 0 ? issue.path.join('.') : 'root',
          message: issue.message,
        })),
      },
      'Failed to parse live apps from cluster response',
    );
  } catch (error) {
    if (!isKubernetesNotFoundError(error)) {
      throw error;
    }
  }

  return [];
}

export async function* watchLiveApps(): AsyncGenerator<LiveApp[]> {
  const changeSignal = new EventEmitter();
  let pendingError: unknown = null;

  const abortController = await k.createWatch().watch(
    '/apis/tesselar.io/v1alpha1/apps',
    { allowWatchBookmarks: true },
    (type) => {
      if (type === 'BOOKMARK') {
        return;
      }

      changeSignal.emit('change');
    },
    (error) => {
      if (error) {
        pendingError = error;
        changeSignal.emit('change');
      }
    },
  );

  try {
    yield await getLiveApps();

    for await (const change of on(changeSignal, 'change')) {
      void change;

      if (pendingError) {
        throw pendingError;
      }

      yield await getLiveApps();
    }
  } finally {
    abortController.abort();
  }
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

function getResponseItemCount(response: unknown) {
  if (
    typeof response === 'object' &&
    response !== null &&
    'items' in response &&
    Array.isArray(response.items)
  ) {
    return response.items.length;
  }

  return undefined;
}
