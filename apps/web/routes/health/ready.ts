import { createFileRoute } from '@tanstack/react-router';
import { isServerReady } from '@/lib/server-bootstrap';

export function GET() {
  const ready = isServerReady();
  return Response.json(
    { ready },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export const Route = createFileRoute('/health/ready')({
  server: { handlers: { GET } },
});
