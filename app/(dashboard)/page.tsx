import { PageContent } from "@/components/page-content";
import { PageTitle } from "@/components/page-header";

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <PageTitle title="Dashboard" />
      <PageContent>
        <p>Welcome to the dashboard!</p>
      </PageContent>
    </div>
  );
}
