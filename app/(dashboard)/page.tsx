import { PageContent } from '@/components/page-content';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <PageContent>
        <p>Welcome to the dashboard!</p>
      </PageContent>
    </div>
  );
}
