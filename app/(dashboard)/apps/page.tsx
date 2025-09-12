import { HydrateClient, prefetch, trpc } from '@/trpc/server';
import { Apps } from './apps';

export const dynamic = 'force-dynamic';

export default async function AppsPage() {
  await prefetch(trpc.apps.queryOptions());

  return (
    <HydrateClient>
      <Apps />
    </HydrateClient>
  );
}
