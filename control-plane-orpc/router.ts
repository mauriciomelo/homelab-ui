import { getApps } from '@/app/api/applications';
import { appSchema } from '@/app/api/schemas';
import { createApp, updateApp } from '@/app/api/applications';
import { os } from '@orpc/server';

export const controlPlaneRouter = {
  apps: {
    list: os.handler(async () => {
      return getApps();
    }),
    create: os.input(appSchema).handler(async ({ input }) => {
      return createApp(input);
    }),
    update: os.input(appSchema).handler(async ({ input }) => {
      return updateApp(input);
    }),
  },
};
