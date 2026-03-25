import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import type { Register } from '@tanstack/react-router';
import type { RequestHandler } from '@tanstack/react-start/server';
import { ensureServerBootstrap } from '@/lib/server-bootstrap';

await ensureServerBootstrap();

const fetch = createStartHandler(defaultStreamHandler);

export default {
  fetch,
} satisfies { fetch: RequestHandler<Register> };
