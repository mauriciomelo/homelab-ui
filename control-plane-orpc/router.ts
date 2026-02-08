import { getApps } from '@/app/api/applications';
import { os } from '@orpc/server';

export const controlPlaneRouter = {
  apps: {
    list: os.handler(async () => {
      return getApps();
    }),
  },
};
