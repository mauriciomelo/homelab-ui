import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { RouterClient } from '@orpc/server';
import { controlPlaneRouter } from './router';
import { getOptionalConfig } from '@/app/(dashboard)/apps/config';

function getUrl() {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/control-plane/rpc`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/control-plane/rpc`;
  }

  return `http://localhost:${getOptionalConfig().PORT}/api/control-plane/rpc`;
}

const link = new RPCLink({
  url: getUrl,
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const client: RouterClient<typeof controlPlaneRouter> = createORPCClient(link);

export const controlPlaneOrpc = createTanstackQueryUtils(client);
