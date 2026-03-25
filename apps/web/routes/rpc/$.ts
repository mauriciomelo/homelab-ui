import { router } from '@/orpc/router';
import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';

const handler = new RPCHandler(router);

export const Route = createFileRoute('/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response } = await handler.handle(request, {
          prefix: '/rpc',
          context: {},
        });

        return response ?? new Response('Not found', { status: 404 });
      },
    },
  },
});
