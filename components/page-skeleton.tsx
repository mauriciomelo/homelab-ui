import { PageContent } from "@/components/page-content";
import { Skeleton } from "@/components/ui/skeleton";

export default function PageSkeleton() {
  return (
    <PageContent>
      <Skeleton className="h-[125px] w-[700px] rounded-xl" />
    </PageContent>
  );
}
