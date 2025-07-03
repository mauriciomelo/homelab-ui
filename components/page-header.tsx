"use client";
import { ClusterSwitcher } from "@/components/team-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createPortal } from "react-dom";
import { useAppSideBar } from "./app-sidebar";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export function PageHeader() {
  const sidebar = useAppSideBar();

  return (
    <header
      style={{
        userSelect: "none",
        // @ts-expect-error electron types are not available in this context
        appRegion: "drag",
      }}
      className="bg-sidebar-accent flex h-20 w-full items-center gap-2 transition-[width,height] ease-linear"
    >
      <div className="flex w-full items-center gap-2 px-4">
        <div
          className={cn("transition-duration-50 w-22 transition-[width]", {
            "w-58": sidebar.open,
          })}
        ></div>
        <h1 id="app-bar-title" className="text-2xl text-gray-600"></h1>

        <div className="grow-1"></div>

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

export function PageTitle({ title }: { title: string }) {
  const titleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    titleRef.current = document.getElementById("app-bar-title");
  }, [title]);

  return (
    <span>
      {titleRef.current
        ? createPortal(<span>{title}</span>, titleRef.current)
        : null}
    </span>
  );
}
