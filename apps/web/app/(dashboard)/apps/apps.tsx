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
import { useQuery } from '@tanstack/react-query';
import { APP_STATUS } from '@/app/constants';
import { useState } from 'react';
import { App } from '@/app/api/applications';
import { Status } from '@/components/ui/status';
import { PageContent } from '@/components/page-content';
import { AppIcon, appStatusProps } from '@/components/app-icon';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AppFormSheet } from './app-form-sheet';

type FormMode = 'edit' | 'create' | null;

export function Apps() {
  const apps = useQuery({
    ...controlPlaneOrpc.apps.list.queryOptions(),
    refetchInterval: 2000,
  });
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);

  const selectedApp = selectedAppName
    ? (apps.data?.find((app) => app.spec.name === selectedAppName) ?? null)
    : null;

  const handleCreateApp = () => {
    setSelectedAppName(null);
    setFormMode('create');
  };

  const handleEditApp = (app: App) => {
    setSelectedAppName(app.spec.name);
    setFormMode('edit');
  };

  const handleCloseForm = () => {
    setSelectedAppName(null);
    setFormMode(null);
    apps.refetch();
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
            {apps.data?.map((app) => (
              <TableRow
                key={app.spec.name}
                className={cn({
                  'animate-pulse': app.status === APP_STATUS.PENDING,
                })}
              >
                <TableCell className="w-2">
                  <Status {...appStatusProps(app.status)} />
                </TableCell>
                <TableCell>
                  <div className="size-4">
                    <AppIcon app={app} showStatus={false} />
                  </div>
                </TableCell>
                <TableCell
                  className="cursor-pointer font-medium"
                  onClick={() => handleEditApp(app)}
                >
                  <div className="flex min-h-9 items-center">
                    {app.spec.name}
                  </div>
                </TableCell>

                <TableCell className="font-medium">{app.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <AppFormSheet
          open={formMode !== null}
          mode={formMode ?? 'edit'}
          selectedApp={selectedApp}
          selectedAppName={selectedAppName}
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
