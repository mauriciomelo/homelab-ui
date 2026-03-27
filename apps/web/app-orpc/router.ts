import {
  appBundleListSchema,
  createApp,
  discardDraft,
  getApp,
  listApps,
  listAppsInputSchema,
  openWith,
  openWithTargetSchema,
  publishApp,
  updateApp,
  watchApp,
  watchApps,
  type ListAppsInput,
} from '@/app/api/app-workspaces';
import { appBundleIdentifierSchema } from '@/app/api/app-bundle-identifier';
import { appBundleSchema } from '@/app/api/schemas';
import { eventIterator, os } from '@orpc/server';
import z from 'zod/v4';

export const appRouter = {
  apps: {
    list: os
      .input(listAppsInputSchema)
      .handler(async <TInput extends ListAppsInput>({ input }: { input: TInput }) => {
        return listApps(input);
      }),
    getApp: os
      .input(appBundleIdentifierSchema)
      .output(appBundleSchema)
      .handler(async ({ input }) => {
        return getApp(input);
      }),
    create: os.input(appBundleSchema).handler(async ({ input }) => {
      return createApp(input);
    }),
    update: os.input(appBundleSchema).handler(async ({ input }) => {
      return updateApp(input);
    }),
    publish: os.input(appBundleSchema).handler(async ({ input }) => {
      return publishApp(input);
    }),
    watchApp: os
      .input(appBundleIdentifierSchema)
      .output(eventIterator(appBundleSchema))
      .handler(async function* ({ input }) {
        yield* watchApp(input);
      }),
    watchApps: os
      .input(listAppsInputSchema)
      .output(eventIterator(appBundleListSchema))
      .handler(async function* ({ input }) {
        yield* watchApps(input);
      }),
    discardDraft: os
      .input(
        z.object({
          draftId: z.string().min(1),
        }),
      )
      .handler(async ({ input }) => {
        return discardDraft(input.draftId);
      }),
    openWith: os
      .input(
        z
          .object({
            target: openWithTargetSchema,
          })
          .and(appBundleIdentifierSchema),
      )
      .handler(async ({ input }) => {
        return openWith(input);
      }),
  },
};
