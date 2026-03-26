'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import {
  appBundleSchema,
  defaultAppBundleData,
  type AppBundleSchema,
} from '@/app/api/schemas';
import type { App } from '@/app/api/applications';
import { ApplicationForm, useApplicationForm } from './application-form';
import { AppDropArea, useAppDropArea } from './app-drop-area';
import { appOrpc } from '@/app-orpc/client';
import { controlPlaneOrpc } from '@/control-plane-orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { OpenWithMenu } from './open-with-menu';
import { produce } from 'immer';

export type AppFormMode = 'edit' | 'create';

type AppFormSheetProps = {
  open: boolean;
  mode: AppFormMode;
  selectedApp: App | null;
  selectedAppName: string | null;
  selectedDraftId: string | null;
  hasPersistedDraft: boolean;
  onSelectedDraftIdChange: (draftId: string | null) => void;
  onOpenChange: (open: boolean) => void;
};

export function AppFormSheet(props: AppFormSheetProps) {
  const formIdentity = `${props.mode}-${props.selectedAppName ?? props.selectedDraftId ?? 'new'}`;

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="bg-muted w-[600px] sm:max-w-[600px]">
        {props.open ? <AppFormSheetBody key={formIdentity} {...props} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function AppFormSheetBody({
  open,
  mode,
  selectedApp,
  selectedAppName,
  selectedDraftId,
  hasPersistedDraft,
  onSelectedDraftIdChange,
  onOpenChange,
}: AppFormSheetProps) {
  const [draftExists, setDraftExists] = useState(hasPersistedDraft);
  const hasAvailableDraft = hasPersistedDraft || draftExists;

  const draftQuery = useQuery({
    ...appOrpc.apps.getDraft.queryOptions({
      input: {
        draftId: selectedDraftId ?? '',
      },
    }),
    enabled:
      open && mode === 'create' && selectedDraftId !== null && hasAvailableDraft,
    refetchInterval: 2000,
  });

  const createDraftMutation = useMutation(
    controlPlaneOrpc.apps.create.mutationOptions(),
  );
  const updateDraftMutation = useMutation(
    controlPlaneOrpc.apps.update.mutationOptions(),
  );

  const currentData =
    mode === 'create'
      ? draftQuery.data?.bundle
      : selectedApp
        ? {
            app: selectedApp.app,
            additionalResources: selectedApp.additionalResources,
          }
        : defaultAppBundleData;

  const defaultValues = async () => {
    if (mode === 'edit') {
      if (selectedApp) {
        return {
          app: selectedApp.app,
          additionalResources: selectedApp.additionalResources,
        };
      }

      return defaultAppBundleData;
    }

    if (selectedDraftId === null) {
      return defaultAppBundleData;
    }

    if (!hasAvailableDraft) {
      return createDefaultDraftBundle(selectedDraftId);
    }

    if (draftQuery.data?.bundle) {
      return draftQuery.data.bundle;
    }

    const draftResult = draftQuery.data ?? (await draftQuery.refetch()).data;

    if (draftResult?.bundle) {
      return draftResult.bundle;
    }

    return createDefaultDraftBundle(selectedDraftId);
  };

  const form = useApplicationForm({
    data: currentData,
    mode,
    defaultValues,
    onPublishSuccess: async () => {
      if (!selectedDraftId) {
        onOpenChange(false);
        return;
      }

      onSelectedDraftIdChange(null);
      onOpenChange(false);
    },
  });
  const appDropArea = useAppDropArea({ form: form.form });

  useEffect(() => {
    setDraftExists(hasPersistedDraft);
  }, [hasPersistedDraft, selectedDraftId]);

  const ensureDraftExists = async () => {
    if (
      mode !== 'create' ||
      selectedDraftId === null ||
      hasAvailableDraft ||
      createDraftMutation.isPending
    ) {
      return;
    }

    await createDraftMutation.mutateAsync(
      createDefaultDraftBundle(selectedDraftId),
    );
    setDraftExists(true);
  };

  useEffect(() => {
    if (!open || mode !== 'create' || !selectedDraftId) {
      return;
    }

    const subscription = form.form.watch((values, { type }) => {
      if (type !== 'change') {
        return;
      }

      const parsedBundle = appBundleSchema.safeParse(values);

      if (!parsedBundle.success) {
        return;
      }

      if (hasAvailableDraft) {
        updateDraftMutation.mutate(parsedBundle.data);
        return;
      }

      createDraftMutation.mutate(parsedBundle.data, {
        onSuccess: () => {
          setDraftExists(true);
        },
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    createDraftMutation,
    form.form,
    hasAvailableDraft,
    mode,
    open,
    selectedDraftId,
    updateDraftMutation,
  ]);

  const isFormLoading =
    form.form.formState.isLoading ||
    (mode === 'create' && selectedDraftId === null);
  const openTargetIdentifier =
    mode === 'create'
      ? selectedDraftId
        ? { draftId: selectedDraftId }
        : null
      : selectedAppName
        ? { appName: selectedAppName }
        : null;

  const isOpenDisabled =
    openTargetIdentifier === null ||
    createDraftMutation.isPending ||
    updateDraftMutation.isPending;

  return (
    <>
      {mode === 'create' && draftQuery.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Draft sync failed</AlertTitle>
          <AlertDescription>
            {draftQuery.error instanceof Error
              ? draftQuery.error.message
              : 'Unable to read the draft from disk.'}
          </AlertDescription>
        </Alert>
      ) : null}
      <Form {...form.form}>
        <form onSubmit={form.onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>
              {mode === 'create'
                ? 'Create New App'
                : (selectedApp?.app.metadata.name ?? selectedAppName)}
            </SheetTitle>
            <SheetDescription>
              {mode === 'create'
                ? 'Configure your new application.'
                : "Edit the App's configuration."}
            </SheetDescription>
          </SheetHeader>
          <AppDropArea className="min-h-0 flex-1" {...appDropArea.dropAreaProps}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {isFormLoading ? (
                <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center p-4 text-sm">
                  {mode === 'create'
                    ? 'Preparing draft workspace...'
                    : 'Loading application...'}
                </div>
              ) : (
                <ApplicationForm className="p-4" {...form} />
              )}
            </div>
          </AppDropArea>

          <SheetFooter>
            <div className="flex w-full gap-3">
              <OpenWithMenu
                targetIdentifier={openTargetIdentifier}
                disabled={isOpenDisabled}
                beforeOpen={
                  mode === 'create' ? ensureDraftExists : undefined
                }
              />
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
    </>
  );
}

function createDefaultDraftBundle(draftId: string | null): AppBundleSchema {
  if (!draftId) {
    return defaultAppBundleData;
  }

  return produce({ ...defaultAppBundleData, draftId }, (draft) => {
    draft.app.metadata.name = `draft-${draftId.slice(0, 8)}`;
    draft.app.spec.image = 'nginx:latest';
  });
}
