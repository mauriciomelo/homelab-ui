"use client";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "./ui/button";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PencilRuler,
  Server,
  Settings,
} from "lucide-react";
import { useContext, useState } from "react";

import { createContext } from "react";
import { cn } from "@/lib/utils";

const AppSideBarContext = createContext({
  open: true,
  setOpen: (value: boolean) => {},
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
        className="mb-2 w-12"
        onClick={() => setOpen(!open)}
      >
        {open ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>

      <SidebarButton icon={PencilRuler} title="Apps" href="/apps" />
      <SidebarButton icon={Server} title="Devices" href="/devices" />
      <div className="grow-1"></div>
      <SidebarButton icon={Settings} title="Settings" href="/settings" />
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

  const collapsed = !useAppSideBar().open;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          className={cn("w-full justify-start", {
            "mb-4": collapsed,
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
