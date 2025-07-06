"use client";
import { ClusterSwitcher } from "@/components/cluster-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppSideBar } from "./app-sidebar";
import { cn } from "@/lib/utils";
import { usePageInfo } from "@/hooks/use-page-title";

export function AppHeader() {
  const sidebar = useAppSideBar();
  const pageInfo = usePageInfo();

  return (
    <header
      style={{
        userSelect: "none",
        // @ts-expect-error electron types are not available in this context
        appRegion: "drag",
      }}
      className="flex h-20 w-full items-center gap-2 bg-gray-100 transition-[width,height] ease-linear"
    >
      <div className="flex w-full items-center gap-2 px-4">
        <div
          className={cn("transition-duration-50 w-22 transition-[width]", {
            "w-58": sidebar.open,
          })}
        ></div>
        <h1 id="app-bar-title" className="text-2xl font-light text-gray-600">
          {pageInfo.title}
        </h1>

        <div className="grow-1"></div>

        <div
          className="flex items-center gap-5"
          // @ts-expect-error electron types are not available in this context
          style={{ appRegion: "no-drag" }}
        >
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
