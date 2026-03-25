import { controlPlaneRouter } from '@/control-plane-orpc/router';
import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';

const handler = new RPCHandler(controlPlaneRouter);

export const Route = createFileRoute('/api/control-plane/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response } = await handler.handle(request, {
          prefix: '/api/control-plane/rpc',
          context: {},
        });

        return response ?? new Response('Not found', { status: 404 });
      },
    },
  },
});
