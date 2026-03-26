import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { RouterClient } from '@orpc/server';
import type { appRouter } from './router';
import { getOptionalConfig } from '@/app/(dashboard)/apps/config';

function getUrl() {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/app/rpc`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/app/rpc`;
  }

  return `http://localhost:${getOptionalConfig().PORT}/api/app/rpc`;
}

const link = new RPCLink({
  url: getUrl,
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const client: RouterClient<typeof appRouter> = createORPCClient(link);

export const appOrpcClient = client;
export const appOrpc = createTanstackQueryUtils(client);
