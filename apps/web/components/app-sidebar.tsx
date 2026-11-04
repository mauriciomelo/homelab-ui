'use client';
import { Link } from '@tanstack/react-router';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
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
  const { open, toggleSidebar, setOpenMobile } = useAppSideBar();

  return (
    <Sidebar
      collapsible="icon"
      className="static h-full md:[&_[data-slot=sidebar-inner]]:bg-gray-50 md:[&_[data-slot=sidebar-inner]]:p-2"
    >
      <SidebarHeader className="md:mb-4 md:gap-0 md:p-0">
        <Button
          variant="ghost"
          className="hidden w-12 md:inline-flex"
          aria-label="Toggle Sidebar"
          onClick={toggleSidebar}
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
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
        <SidebarGroup className="md:p-0">
          <SidebarMenu className="md:gap-0">
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
      <SidebarFooter className="md:p-0">
        <SidebarMenu className="md:gap-0">
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
  const { open, isMobile, setOpenMobile } = useAppSideBar();
  const collapsed = !isMobile && !open;
  const link = (
    <Link
      to={href}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => {
        if (isMobile) setOpenMobile(false);
      }}
    >
      <IconComponent
        className={cn('text-gray-600', { 'scale-140 p-0': collapsed })}
      />
      <span className={cn({ hidden: collapsed })}>{title}</span>
    </Link>
  );

  return (
    <SidebarMenuItem>
      {isMobile ? (
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={title}
          size="lg"
        >
          {link}
        </SidebarMenuButton>
      ) : (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="lg"
              className={cn('flex w-full justify-start', {
                'mb-4': collapsed,
                'bg-gray-200': isActive,
              })}
              asChild
            >
              {link}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={!collapsed}>
            <p>{title}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </SidebarMenuItem>
  );
}
