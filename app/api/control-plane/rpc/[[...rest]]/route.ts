import { controlPlaneRouter } from '@/control-plane-orpc/router';
import { RPCHandler } from '@orpc/server/fetch';

const handler = new RPCHandler(controlPlaneRouter);

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/api/control-plane/rpc',
    context: {},
  });

  return response ?? new Response('Not found', { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
