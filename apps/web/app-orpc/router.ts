import {
  createApp,
  getApp,
  listApps,
  updateApp,
  watchApps,
  publishedAppBundleSchema,
} from '@/app/api/app-workspaces';
import { appBundleSchema } from '@/app/api/schemas';
import { eventIterator, os } from '@orpc/server';
import z from 'zod/v4';

export const appRouter = {
  apps: {
    list: os.handler(() => listApps()),
    getApp: os
      .input(z.object({ appName: z.string().min(1) }))
      .handler(({ input }) => getApp(input)),
    create: os.input(appBundleSchema).handler(({ input }) => createApp(input)),
    update: os.input(appBundleSchema).handler(({ input }) => updateApp(input)),
    watchApps: os
      .output(eventIterator(z.array(publishedAppBundleSchema)))
      .handler(async function* () {
        yield* watchApps();
      }),
  },
};
