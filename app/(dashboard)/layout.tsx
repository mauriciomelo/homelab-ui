import { AppSideBar, AppSideBarProvider } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppSideBarProvider>
      <div className="flex h-screen flex-col">
        <PageHeader />
        <div className="flex h-full">
          <AppSideBar />

          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
        </div>
      </div>
    </AppSideBarProvider>
  );
}
