import { AppSideBar, AppSideBarProvider } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppSideBarProvider>
      <div className="flex min-h-svh w-full flex-col">
        <AppHeader />
        <div className="flex min-h-0 flex-1">
          <AppSideBar />

          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </div>
        </div>
      </div>
    </AppSideBarProvider>
  );
}
