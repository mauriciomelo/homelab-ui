'use client';

import type { AppBundleIdentifier } from '@/app/api/app-bundle-identifier';
import { appOrpc } from '@/app-orpc/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMutation } from '@tanstack/react-query';

export function OpenWithMenu({
  targetIdentifier: appIdentifier,
  disabled,
  beforeOpen,
}: {
  targetIdentifier: AppBundleIdentifier | null;
  disabled?: boolean;
  beforeOpen?: () => Promise<void>;
}) {
  const openWithMutation = useMutation(appOrpc.apps.openWith.mutationOptions());

  const isDisabled =
    disabled || appIdentifier === null || openWithMutation.isPending;

  const handleOpenWith = async (
    target: 'finder' | 'terminal' | 'vscode' | 'cursor' | 'ghostty',
  ) => {
    if (!appIdentifier) {
      return;
    }

    await beforeOpen?.();

    await openWithMutation.mutateAsync({
      target,
      ...appIdentifier,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={isDisabled}>
          Open in
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => handleOpenWith('finder')}>
          <img
            src="/app-icons/finder.png"
            alt=""
            aria-hidden="true"
            className="size-4 rounded-[4px]"
          />
          Finder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleOpenWith('vscode')}>
          <img
            src="/app-icons/vscode.png"
            alt=""
            aria-hidden="true"
            className="size-4 rounded-[4px]"
          />
          VSCode
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleOpenWith('cursor')}>
          <img
            src="/app-icons/cursor.png"
            alt=""
            aria-hidden="true"
            className="size-4 rounded-[4px]"
          />
          Cursor
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleOpenWith('terminal')}>
          <img
            src="/app-icons/terminal.png"
            alt=""
            aria-hidden="true"
            className="size-4 rounded-[4px]"
          />
          Terminal
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleOpenWith('ghostty')}>
          <img
            src="/app-icons/ghostty.png"
            alt=""
            aria-hidden="true"
            className="size-4 rounded-[4px]"
          />
          Ghostty
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
