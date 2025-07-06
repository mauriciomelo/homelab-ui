"use client";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "./ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useContext, useState } from "react";

import { createContext } from "react";
import { cn } from "@/lib/utils";
import { pathMap, usePageInfo } from "@/hooks/use-page-title";

const AppSideBarContext = createContext({
  open: true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setOpen: (_value: boolean) => {},
});

export function useAppSideBar() {
  return useContext(AppSideBarContext);
}

export function AppSideBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <AppSideBarContext.Provider value={{ open, setOpen }}>
      {children}
    </AppSideBarContext.Provider>
  );
}

export function AppSideBar() {
  const { open, setOpen } = useAppSideBar();

  return (
    <div
      data-open={open}
      className="group transition-width flex h-full flex-col border-r bg-gray-50 p-2 duration-100 data-[open=false]:w-16 data-[open=true]:w-50"
    >
      <Button
        variant="ghost"
        className="mb-4 w-12"
        onClick={() => setOpen(!open)}
      >
        {open ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>

      <SidebarButton
        icon={pathMap["/"].icon}
        title={pathMap["/"].title}
        href="/"
      />
      <SidebarButton
        icon={pathMap["/apps"].icon}
        title={pathMap["/apps"].title}
        href="/apps"
      />
      <SidebarButton
        icon={pathMap["/devices"].icon}
        title={pathMap["/devices"].title}
        href="/devices"
      />
      <div className="grow-1"></div>
      <SidebarButton
        icon={pathMap["/settings"].icon}
        title={pathMap["/settings"].title}
        href="/settings"
      />
    </div>
  );
}

function SidebarButton({
  icon,
  title,
  href,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  href: string;
}) {
  const IconComponent = icon;

  const currentPath = usePageInfo().pathname;

  const isActive = currentPath === href;

  const collapsed = !useAppSideBar().open;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          className={cn("w-full justify-start", {
            "mb-4": collapsed,
            "bg-gray-200": isActive,
          })}
          asChild
        >
          <Link href={href}>
            <IconComponent className="text-gray-600 group-data-[open=false]:scale-140 group-data-[open=false]:p-0" />
            <span className="group-data-[open=false]:hidden">{title}</span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" hidden={!collapsed}>
        <p>{title}</p>
      </TooltipContent>
    </Tooltip>
  );
}
