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
import {
  getAppBundleIdentifier,
  isDraftAppBundleIdentifier as isDraft,
  type AppBundleIdentifier,
} from '@/app/api/app-bundle-identifier';
import { Status } from '@/components/ui/status';
import { PageContent } from '@/components/page-content';
import { AppIcon, appStatusProps } from '@/components/app-icon';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AppFormSheet } from './app-form-sheet';

type FormMode = 'edit' | 'create' | null;
const initialAppItems: AppBundleListItem[] = [];

function isDraftApp(item: AppBundleListItem): item is DraftAppBundle {
  return 'draftId' in item;
}

function isPublishedApp(item: AppBundleListItem): item is PublishedAppBundle {
  return !isDraftApp(item);
}

function getListItemStatus(item: AppBundleListItem) {
  return isDraftApp(item) ? APP_STATUS.UNKNOWN : item.status.phase;
}

function getSelectedApp(
  appItems: AppBundleListItem[],
  selectedIdentifier: AppBundleIdentifier | null,
) {
  if (!selectedIdentifier || isDraft(selectedIdentifier)) {
    return null;
  }

  return (
    appItems
      .filter(isPublishedApp)
      .find((app) => app.app.metadata.name === selectedIdentifier.appName) ??
    null
  );
}

function hasPersistedDraftApp(
  appItems: AppBundleListItem[],
  selectedIdentifier: AppBundleIdentifier | null,
) {
  if (!selectedIdentifier || !isDraft(selectedIdentifier)) {
    return false;
  }

  return appItems
    .filter(isDraftApp)
    .some((draft) => draft.draftId === selectedIdentifier.draftId);
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

  const [selectedIdentifier, setSelectedIdentifier] =
    useState<AppBundleIdentifier | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const appItems = watchedApps.data ?? [];
  const selectedApp = getSelectedApp(appItems, selectedIdentifier);
  const hasPersistedDraft = hasPersistedDraftApp(appItems, selectedIdentifier);

  const handleCreateApp = () => {
    const nextIdentifier = getAppBundleIdentifier({
      draftId: crypto.randomUUID(),
    });

    setSelectedIdentifier(nextIdentifier);
    setFormMode('create');
  };

  const handleEditApp = (app: PublishedAppBundle) => {
    setSelectedIdentifier(
      getAppBundleIdentifier({ appName: app.app.metadata.name }),
    );
    setFormMode('edit');
  };

  const handleEditDraft = (draft: DraftAppBundle) => {
    setSelectedIdentifier(getAppBundleIdentifier({ draftId: draft.draftId }));
    setFormMode('create');
  };

  const handleCloseForm = () => {
    setSelectedIdentifier(null);
    setFormMode(null);
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
          open={formMode !== null}
          mode={formMode ?? 'edit'}
          selectedApp={selectedApp}
          selectedIdentifier={selectedIdentifier}
          hasPersistedDraft={hasPersistedDraft}
          onSelectedIdentifierChange={setSelectedIdentifier}
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
