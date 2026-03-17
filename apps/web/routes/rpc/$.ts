import { router } from '@/orpc/router';
import { ensureServerBootstrap } from '@/lib/server-bootstrap';
import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';

const handler = new RPCHandler(router);

export const Route = createFileRoute('/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        await ensureServerBootstrap();

        const { response } = await handler.handle(request, {
          prefix: '/rpc',
          context: {},
        });

        return response ?? new Response('Not found', { status: 404 });
      },
    },
  },
});
