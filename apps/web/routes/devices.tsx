import DashboardLayout from '@/app/(dashboard)/layout';
import { Devices } from '@/app/(dashboard)/devices/devices';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/devices')({
  component: DevicesRoute,
});

function DevicesRoute() {
  return (
    <DashboardLayout>
      <Devices />
    </DashboardLayout>
  );
}
