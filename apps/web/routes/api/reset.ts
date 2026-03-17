import { reset } from '@/app/api/reset/route';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/reset')({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(await reset());
      },
    },
  },
});
