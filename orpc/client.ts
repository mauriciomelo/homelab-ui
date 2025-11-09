import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { RouterClient } from '@orpc/server';
import { router } from './router';
import z from 'zod/v4';

export const remoteServerSchema = z.object({
  remoteServerUrl: z.url(),
});

const link = new RPCLink({
  url: (context, path, input) => {
    const isRemote = remoteServerSchema.safeParse(context);
    if (isRemote.success) {
      return `${isRemote.data.remoteServerUrl}/rpc`;
    }

    return 'http://localhost:3000/rpc';
  },
  headers: () => ({
    authorization: 'Bearer token',
  }),
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const client: RouterClient<typeof router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
