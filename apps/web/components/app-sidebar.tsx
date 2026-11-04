'use client';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { pathMap, usePageInfo } from '@/hooks/use-page-title';

export function useAppSideBar() {
  return useSidebar();
}

export function AppSideBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const style: React.CSSProperties & {
    '--sidebar-width': string;
    '--sidebar-width-icon': string;
  } = {
    '--sidebar-width': '12.5rem',
    '--sidebar-width-icon': '4rem',
  };

  return (
    <SidebarProvider style={style} className="flex-col">
      {children}
    </SidebarProvider>
  );
}

export function AppSideBar() {
  const { setOpenMobile } = useAppSideBar();

  return (
    <Sidebar collapsible="icon" className="top-20 h-[calc(100svh-5rem)]">
      <SidebarHeader>
        <SidebarTrigger className="hidden size-12 md:flex" />
        <Button
          variant="ghost"
          size="icon"
          className="self-end md:hidden"
          aria-label="Close navigation"
          onClick={() => setOpenMobile(false)}
        >
          <X />
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarButton
              icon={pathMap['/'].icon}
              title={pathMap['/'].title}
              href="/"
            />
            <SidebarButton
              icon={pathMap['/apps'].icon}
              title={pathMap['/apps'].title}
              href="/apps"
            />
            <SidebarButton
              icon={pathMap['/devices'].icon}
              title={pathMap['/devices'].title}
              href="/devices"
            />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarButton
            icon={pathMap['/settings'].icon}
            title={pathMap['/settings'].title}
            href="/settings"
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
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
  const { isMobile, setOpenMobile } = useAppSideBar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={title} size="lg">
        <Link
          to={href}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          <IconComponent className="text-gray-600" />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
