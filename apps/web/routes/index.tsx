import DashboardLayout from '@/app/(dashboard)/layout';
import { PageContent } from '@/components/page-content';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <DashboardLayout>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <PageContent>
          <p>Welcome to the dashboard!</p>
        </PageContent>
      </div>
    </DashboardLayout>
  );
}
