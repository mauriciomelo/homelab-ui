import {
  discardDraft,
  getApp,
  listDrafts,
  openWith,
  openWithTargetSchema,
  watchApp,
} from '@/app/api/app-workspaces';
import { appBundleIdentifierSchema } from '@/app/api/app-bundle-identifier';
import { appBundleSchema } from '@/app/api/schemas';
import { eventIterator, os } from '@orpc/server';
import z from 'zod/v4';

export const appRouter = {
  apps: {
    listDrafts: os.handler(async () => {
      return listDrafts();
    }),
    getApp: os
      .input(appBundleIdentifierSchema)
      .output(appBundleSchema)
      .handler(async ({ input }) => {
        return getApp(input);
      }),
    watchApp: os
      .input(appBundleIdentifierSchema)
      .output(eventIterator(appBundleSchema))
      .handler(async function* ({ input }) {
        yield* watchApp(input);
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
