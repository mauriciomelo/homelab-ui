'use client';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClusterSwitcher } from '@/components/cluster-switcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppSideBar } from './app-sidebar';
import { cn } from '@/lib/utils';
import { usePageInfo } from '@/hooks/use-page-title';

export function AppHeader() {
  const sidebar = useAppSideBar();
  const pageInfo = usePageInfo();

  return (
    <header
      style={{
        userSelect: 'none',
        // @ts-expect-error electron types are not available in this context
        appRegion: 'drag',
      }}
      className="flex h-20 w-full shrink-0 items-center gap-2 bg-gray-100 transition-[width,height] ease-linear md:shrink"
    >
      <div className="flex w-full min-w-0 items-center gap-2 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          aria-expanded={sidebar.openMobile}
          onClick={sidebar.toggleSidebar}
          // @ts-expect-error electron types are not available in this context
          style={{ appRegion: 'no-drag' }}
        >
          <Menu />
        </Button>
        <div
          className={cn(
            'transition-duration-50 w-22 hidden shrink-0 transition-[width] md:block',
            {
              'w-58': sidebar.open,
            },
          )}
        ></div>
        <h1
          id="app-bar-title"
          className="shrink-0 text-2xl font-light text-gray-600"
        >
          {pageInfo.title}
        </h1>

        <div className="grow-1"></div>

        <div
          className="flex min-w-0 items-center gap-2 md:gap-5"
          // @ts-expect-error electron types are not available in this context
          style={{ appRegion: 'no-drag' }}
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
