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
import { ApplicationForm, useApplicationForm } from './application-form';
import { controlPlaneOrpc } from '@/control-plane-orpc/client';
import { useQuery } from '@tanstack/react-query';
import { APP_STATUS } from '@/app/constants';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useState } from 'react';
import { App } from '@/app/api/applications';
import { Status } from '@/components/ui/status';
import { PageContent } from '@/components/page-content';
import { AppIcon, appStatusProps } from '@/components/app-icon';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Plus } from 'lucide-react';
import { AppDropArea, useAppDropArea } from './app-drop-area';
import { defaultAppData } from '@/app/api/schemas';

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

  const formData = selectedApp?.spec ?? defaultAppData;
  // Force a fresh form instance when switching between modes or apps.
  const formKey = `${formMode ?? 'idle'}-${selectedAppName ?? 'new'}`;

  const form = useApplicationForm({
    data: formData,
    mode: formMode || 'edit',
  });
  const appDropArea = useAppDropArea({ form: form.form });

  const handleCreateApp = () => {
    setSelectedAppName(null);
    setFormMode('create');
    form.form.reset(defaultAppData);
  };

  const handleEditApp = (app: App) => {
    setSelectedAppName(app.spec.name);
    setFormMode('edit');
    form.form.reset(app.spec);
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
        <Sheet
          open={formMode !== null}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseForm();
            }
          }}
        >
          <SheetContent className="bg-muted w-[600px] sm:max-w-[600px]">
            <Form {...form.form}>
              <form
                onSubmit={form.onSubmit}
                className="flex min-h-0 flex-1 flex-col"
              >
                <SheetHeader>
                  <SheetTitle>
                    {formMode === 'create'
                      ? 'Create New App'
                      : (selectedApp?.spec.name ?? selectedAppName)}
                  </SheetTitle>
                  <SheetDescription>
                    {formMode === 'create'
                      ? 'Configure your new application.'
                      : "Edit the App's configuration."}
                  </SheetDescription>
                </SheetHeader>
                <AppDropArea
                  className="min-h-0 flex-1"
                  {...appDropArea.dropAreaProps}
                >
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <ApplicationForm key={formKey} className="p-4" {...form} />
                  </div>
                </AppDropArea>

                <SheetFooter>
                  <div className="flex gap-3">
                    {form.form.formState.isSubmitting ? (
                      <Button type="submit" className="flex-1" disabled>
                        {form.mode === 'create' ? 'Creating...' : 'Updating...'}
                      </Button>
                    ) : (
                      <Button type="submit" className="flex-1">
                        {form.mode === 'create' ? 'Create' : 'Update'}
                      </Button>
                    )}
                  </div>
                </SheetFooter>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      </PageContent>
    </>
  );
}
