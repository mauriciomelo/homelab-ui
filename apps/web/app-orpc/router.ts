import {
  discardDraft,
  getDraft,
  listDrafts,
  openWith,
  openWithTargetSchema,
} from '@/app/api/app-workspaces';
import { os } from '@orpc/server';
import z from 'zod/v4';

export const appRouter = {
  apps: {
    listDrafts: os.handler(async () => {
      return listDrafts();
    }),
    getDraft: os
      .input(
        z.object({
          draftId: z.string().min(1),
        }),
      )
      .handler(async ({ input }) => {
        return getDraft(input.draftId);
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
            appName: z.string().min(1).optional(),
            draftId: z.string().min(1).optional(),
          })
          .superRefine((input, ctx) => {
            const targetCount = Number(input.appName !== undefined) + Number(input.draftId !== undefined);

            if (targetCount !== 1) {
              ctx.addIssue({
                code: 'custom',
                message: 'Provide exactly one of appName or draftId',
                path: ['appName'],
              });
            }
          }),
      )
      .handler(async ({ input }) => {
        return openWith(input);
      }),
  },
};
