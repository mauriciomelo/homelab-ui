import { join } from '@/app/api/join/route';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod/v4';

const joinSchema = z.object({
  token: z.string().min(1).max(300),
  serverUrl: z.url().min(1).max(300),
});

export const Route = createFileRoute('/api/join')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = joinSchema.parse(await request.json());
        const response = await join({
          token: body.token,
          controlPlaneUrl: body.serverUrl,
        });

        return Response.json(response);
      },
    },
  },
});
