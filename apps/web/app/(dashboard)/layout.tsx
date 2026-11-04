import { AppSideBar, AppSideBarProvider } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppSideBarProvider>
      <div className="flex min-h-svh w-full flex-col md:h-screen">
        <AppHeader />
        <div className="flex min-h-0 flex-1 md:h-full md:flex-initial">
          <AppSideBar />

          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </div>
        </div>
      </div>
    </AppSideBarProvider>
  );
}
