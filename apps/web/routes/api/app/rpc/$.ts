import { appRouter } from '@/app-orpc/router';
import { RPCHandler } from '@orpc/server/fetch';
import { createFileRoute } from '@tanstack/react-router';

const handler = new RPCHandler(appRouter);

export const Route = createFileRoute('/api/app/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response } = await handler.handle(request, {
          prefix: '/api/app/rpc',
          context: {},
        });

        return response ?? new Response('Not found', { status: 404 });
      },
    },
  },
});
