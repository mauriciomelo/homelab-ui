import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { controlPlaneRouter } from './router';
import { getOptionalConfig } from '@/app/(dashboard)/apps/config';

function getUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/control-plane/rpc`;
  }

  return `http://localhost:${getOptionalConfig().PORT}/api/control-plane/rpc`;
}

const link = new RPCLink({
  url: getUrl,
  fetch: (input, init) => globalThis.fetch(input, init),
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const controlPlaneOrpcServerClient: RouterClient<
  typeof controlPlaneRouter
> = createORPCClient(link);
