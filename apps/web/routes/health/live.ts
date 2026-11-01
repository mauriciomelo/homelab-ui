import { createFileRoute } from '@tanstack/react-router';

export function GET() {
  return Response.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const Route = createFileRoute('/health/live')({
  server: { handlers: { GET } },
});
