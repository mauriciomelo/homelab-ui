import { APP_STATUS, AppStatus } from '@/app/constants';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ComponentProps, useState } from 'react';
import { Status } from './ui/status';
import type { PublishedAppBundle } from '@/app/api/applications';
import type { DraftAppBundle } from '@/app/api/app-workspaces';

export function AppIcon({
  app,
  showStatus = true,
}: {
  app: PublishedAppBundle | DraftAppBundle;
  showStatus?: boolean;
}) {
  const [imageError, setImageError] = useState(false);

  const fallbackSrc =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXBlbmNpbC1ydWxlci1pY29uIGx1Y2lkZS1wZW5jaWwtcnVsZXIiPjxwYXRoIGQ9Ik0xMyA3IDguNyAyLjdhMi40MSAyLjQxIDAgMCAwLTMuNCAwTDIuNyA1LjNhMi40MSAyLjQxIDAgMCAwIDAgMy40TDcgMTMiLz48cGF0aCBkPSJtOCA2IDItMiIvPjxwYXRoIGQ9Im0xOCAxNiAyLTIiLz48cGF0aCBkPSJtMTcgMTEgNC4zIDQuM2MuOTQuOTQuOTQgMi40NiAwIDMuNGwtMi42IDIuNmMtLjk0Ljk0LTIuNDYuOTQtMy40IDBMMTEgMTciLz48cGF0aCBkPSJNMjEuMTc0IDYuODEyYTEgMSAwIDAgMC0zLjk4Ni0zLjk4N0wzLjg0MiAxNi4xNzRhMiAyIDAgMCAwLS41LjgzbC0xLjMyMSA0LjM1MmEuNS41IDAgMCAwIC42MjMuNjIybDQuMzUzLTEuMzJhMiAyIDAgMCAwIC44My0uNDk3eiIvPjxwYXRoIGQ9Im0xNSA1IDQgNCIvPjwvc3ZnPg==';
  const appName = app.app.metadata.name;
  const iconUrl = `https://cdn.simpleicons.org/${appName}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <div className="overflow-hidden rounded-sm">
            <img
              src={imageError ? fallbackSrc : iconUrl}
              alt={appName}
              onError={() => setImageError(true)}
            />
          </div>
          {showStatus && 'status' in app ? (
            <div className="absolute -right-1 -bottom-1 scale-80 rounded-full border-2 border-white">
              <Status {...appStatusProps(app.status.phase)} />
            </div>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent>{appName}</TooltipContent>
    </Tooltip>
  );
}

export function appStatusProps(
  status: AppStatus,
): ComponentProps<typeof Status> {
  if (status === APP_STATUS.RUNNING) {
    return {
      color: 'green',
      animate: false,
    };
  }

  if (status === APP_STATUS.PENDING) {
    return {
      color: 'orange',
      animate: true,
    };
  }

  return {
    color: 'gray',
    animate: false,
  };
}
