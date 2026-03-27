'use client';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { appOrpcClient } from '@/app-orpc/client';
import { APP_STATUS } from '@/app/constants';
import {
  experimental_streamedQuery as streamedQuery,
  useQuery,
} from '@tanstack/react-query';
import { useState } from 'react';
import type {
  AppBundleListItem,
  DraftAppBundle,
  PublishedAppBundle,
} from '@/app/api/app-workspaces';
import { Status } from '@/components/ui/status';
import { PageContent } from '@/components/page-content';
import { AppIcon, appStatusProps } from '@/components/app-icon';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  AppFormSheet,
  type AppFormSheetSession,
} from './app-form-sheet';

const initialAppItems: AppBundleListItem[] = [];

function isDraftApp(item: AppBundleListItem): item is DraftAppBundle {
  return 'draftId' in item;
}

function getListItemStatus(item: AppBundleListItem) {
  return isDraftApp(item) ? APP_STATUS.UNKNOWN : item.status.phase;
}

export function Apps() {
  const watchedApps = useQuery({
    queryKey: ['watch-apps'],
    queryFn: streamedQuery({
      streamFn: async () =>
        appOrpcClient.apps.watchApps({
          includeDrafts: true,
        }),
      initialValue: initialAppItems,
      reducer: (_previous, nextItems) => nextItems,
      refetchMode: 'reset',
    }),
  });

  const [sheetSession, setSheetSession] = useState<AppFormSheetSession | null>(
    null,
  );
  const appItems = watchedApps.data ?? [];

  const handleCreateApp = () => {
    const nextIdentifier = {
      draftId: crypto.randomUUID(),
      persisted: false,
    };

    setSheetSession({
      mode: 'create',
      identifier: nextIdentifier,
      initialData: undefined,
    });
  };

  const handleEditApp = (app: PublishedAppBundle) => {
    const identifier = { appName: app.app.metadata.name };

    setSheetSession({ mode: 'edit', identifier, initialData: app });
  };

  const handleEditDraft = (draft: DraftAppBundle) => {
    const identifier = { draftId: draft.draftId, persisted: true };

    setSheetSession({
      mode: 'create',
      identifier,
      initialData: draft,
    });
  };

  const handleCloseForm = () => {
    setSheetSession(null);
  };
  return (
    <>
      <PageContent>
        <div className="mb-4 flex justify-end">
          <Button onClick={handleCreateApp}>
            <Plus className="mr-2 h-4 w-4" />
            Create App
          </Button>
        </div>
        <Table className="max-w-7xl table-fixed">
          <TableCaption>A list of your installed Apps.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-[200px] font-medium text-gray-600">
                App
              </TableHead>
              <TableHead className="font-medium text-gray-600">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appItems.map((app) => (
              <TableRow
                key={
                  isDraftApp(app)
                    ? `draft-${app.draftId}`
                    : `app-${app.app.metadata.name}`
                }
                className={cn({
                  'animate-pulse':
                    getListItemStatus(app) === APP_STATUS.PENDING,
                })}
              >
                <TableCell className="w-2">
                  <Status {...appStatusProps(getListItemStatus(app))} />
                </TableCell>
                <TableCell>
                  <div className="size-4">
                    <AppIcon app={app} showStatus={false} />
                  </div>
                </TableCell>
                <TableCell
                  className="cursor-pointer font-medium"
                  onClick={() => {
                    if (isDraftApp(app)) {
                      handleEditDraft(app);
                      return;
                    }

                    handleEditApp(app);
                  }}
                >
                  <div className="flex min-h-9 items-center">
                    {app.app.metadata.name}
                  </div>
                </TableCell>

                <TableCell className="font-medium">
                  {isDraftApp(app) ? 'Draft' : app.status.phase}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <AppFormSheet
          open={sheetSession !== null}
          session={sheetSession}
          onSessionChange={setSheetSession}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseForm();
            }
          }}
        />
      </PageContent>
    </>
  );
}
