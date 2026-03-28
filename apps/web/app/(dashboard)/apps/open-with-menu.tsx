'use client';

import type { AppBundleIdentifier } from '@/app/api/app-bundle-identifier';
import { appOrpc } from '@/app-orpc/client';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

type OpenWithTarget = 'finder' | 'terminal' | 'vscode' | 'cursor' | 'ghostty';

const openWithOptions: Array<{
  target: OpenWithTarget;
  label: string;
  iconSrc: string;
}> = [
  {
    target: 'vscode',
    label: 'VSCode',
    iconSrc: '/app-icons/vscode.png',
  },
  {
    target: 'cursor',
    label: 'Cursor',
    iconSrc: '/app-icons/cursor.png',
  },
  {
    target: 'finder',
    label: 'Finder',
    iconSrc: '/app-icons/finder.png',
  },
  {
    target: 'terminal',
    label: 'Terminal',
    iconSrc: '/app-icons/terminal.png',
  },
  {
    target: 'ghostty',
    label: 'Ghostty',
    iconSrc: '/app-icons/ghostty.png',
  },
];

function isOpenWithTarget(value: string): value is OpenWithTarget {
  return openWithOptions.some((option) => option.target === value);
}

function OpenWithIcon({ iconSrc }: { iconSrc: string }) {
  return (
    <img
      src={iconSrc}
      alt=""
      aria-hidden="true"
      className="size-4 rounded-[4px]"
    />
  );
}

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
  const [selectedTarget, setSelectedTarget] =
    useState<OpenWithTarget>('vscode');

  const isDisabled =
    disabled || appIdentifier === null || openWithMutation.isPending;
  const selectedOption = useMemo(
    () =>
      openWithOptions.find((option) => option.target === selectedTarget) ??
      openWithOptions[0],
    [selectedTarget],
  );

  const handleSelectTarget = async (target: OpenWithTarget) => {
    setSelectedTarget(target);
    await handleOpenWith(target);
  };

  const handleOpenWith = async (target: OpenWithTarget) => {
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
    <ButtonGroup className="self-start">
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={isDisabled}
        onClick={() => handleOpenWith(selectedTarget)}
        className="min-w-0 px-2 text-[11px]"
      >
        <OpenWithIcon iconSrc={selectedOption.iconSrc} />
        Open in
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isDisabled}
            className="px-1.5"
            aria-label="Choose app to open with"
          >
            <ChevronDownIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={selectedTarget}
            onValueChange={(value) => {
              if (isOpenWithTarget(value)) {
                handleSelectTarget(value);
              }
            }}
          >
            {openWithOptions.map((option) => (
              <DropdownMenuRadioItem key={option.target} value={option.target}>
                <OpenWithIcon iconSrc={option.iconSrc} />
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
