import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ClusterSwitcher } from "@/components/team-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex h-16 w-full items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />

        <h1 className="text-lg font-semibold">{title}</h1>

        <div className="w-full"></div>

        <div className="flex items-center gap-5">
          <ClusterSwitcher />

          <Avatar>
            <AvatarImage
              src="https://github.com/mauriciomelo.png"
              alt="@mauriciomelo"
            />
            <AvatarFallback>MM</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
