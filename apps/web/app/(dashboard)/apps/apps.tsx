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
import { controlPlaneOrpc } from '@/control-plane-orpc/client';
import { appOrpc } from '@/app-orpc/client';
import { useQuery } from '@tanstack/react-query';
import { APP_STATUS } from '@/app/constants';
import { useState } from 'react';
import type { App } from '@/app/api/applications';
import type { DraftApp } from '@/app/api/app-workspaces';
import { Status } from '@/components/ui/status';
import { PageContent } from '@/components/page-content';
import { AppIcon, appStatusProps } from '@/components/app-icon';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AppFormSheet } from './app-form-sheet';

type FormMode = 'edit' | 'create' | null;
type AppListItem = App | DraftApp;

function isDraftApp(item: AppListItem): item is DraftApp {
  return 'draftId' in item;
}

function isPublishedApp(item: AppListItem): item is App {
  return !isDraftApp(item);
}

function getListItemStatus(item: AppListItem) {
  return isDraftApp(item) ? APP_STATUS.UNKNOWN : item.status.phase;
}

export function Apps() {
  const apps = useQuery({
    ...controlPlaneOrpc.apps.list.queryOptions(),
    refetchInterval: 2000,
  });
  const drafts = useQuery({
    ...appOrpc.apps.listDrafts.queryOptions(),
    refetchInterval: 2000,
  });
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const appItems: AppListItem[] = [
    ...(drafts.data ?? []),
    ...(apps.data ?? []).flatMap((app) => {
      return app.app?.metadata?.name ? [app] : [];
    }),
  ];

  const selectedApp = selectedAppName
    ? (appItems
        .filter(isPublishedApp)
        .find((app) => app.app.metadata.name === selectedAppName) ?? null)
    : null;
  const hasPersistedDraft = selectedDraftId
    ? (drafts.data?.some((draft) => draft.draftId === selectedDraftId) ?? false)
    : false;

  const handleCreateApp = () => {
    setSelectedAppName(null);
    setSelectedDraftId(crypto.randomUUID());
    setFormMode('create');
  };

  const handleEditApp = (app: App) => {
    setSelectedAppName(app.app.metadata.name);
    setSelectedDraftId(null);
    setFormMode('edit');
  };

  const handleEditDraft = (draft: DraftApp) => {
    setSelectedAppName(null);
    setSelectedDraftId(draft.draftId);
    setFormMode('create');
  };

  const handleCloseForm = () => {
    setSelectedAppName(null);
    setSelectedDraftId(null);
    setFormMode(null);
    apps.refetch();
    drafts.refetch();
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
                  'animate-pulse': getListItemStatus(app) === APP_STATUS.PENDING,
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
          selectedAppName={selectedAppName}
          selectedDraftId={selectedDraftId}
          hasPersistedDraft={hasPersistedDraft}
          onSelectedDraftIdChange={setSelectedDraftId}
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
