import { join } from '@/app/api/join/route';
import { reset } from '@/app/api/reset/route';
import { os } from '@orpc/server';
import * as z from 'zod/v4';

export const router = {
  devices: {
    join: os
      .input(
        z.object({
          token: z.string().min(1).max(300),
          controlPlaneUrl: z.url().min(1).max(300),
        }),
      )
      .handler(async ({ input }) => {
        return join({ ...input });
      }),
    reset: os.handler(async () => {
      return reset();
    }),
  },
};
