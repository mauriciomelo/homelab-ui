import DashboardLayout from '@/app/(dashboard)/layout';
import { Apps } from '@/app/(dashboard)/apps/apps';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/apps')({
  component: AppsRoute,
});

function AppsRoute() {
  return (
    <DashboardLayout>
      <Apps />
    </DashboardLayout>
  );
}
