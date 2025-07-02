"use client";

import * as React from "react";
import {
  AudioWaveform,
  GalleryVerticalEnd,
  PencilRuler,
  Server,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";

import { ClusterSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// This is sample data.
const data = {
  navMain: [
    {
      title: "Apps",
      url: "/apps",
      icon: PencilRuler,
      isActive: true,
      items: [
        {
          title: "All Apps",
          url: "/apps",
        },
      ],
    },
    {
      title: "Devices",
      url: "/devices",
      icon: Server,
      isActive: true,
      items: [
        {
          title: "All Devices",
          url: "/devices",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
