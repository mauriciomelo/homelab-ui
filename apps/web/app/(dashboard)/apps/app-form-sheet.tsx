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
  isDraftAppBundleIdentifier,
  type AppBundleIdentifier,
} from '@/app/api/app-bundle-identifier';
import {
  appBundleSchema,
  defaultAppBundleData,
  type AppBundleSchema,
} from '@/app/api/schemas';
import type { App } from '@/app/api/applications';
import { ApplicationForm, useApplicationForm } from './application-form';
import { AppDropArea, useAppDropArea } from './app-drop-area';
import { appOrpc, appOrpcClient } from '@/app-orpc/client';
import { controlPlaneOrpc } from '@/control-plane-orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { OpenWithMenu } from './open-with-menu';
import { produce } from 'immer';
import isEqual from 'lodash/isEqual';

export type AppFormMode = 'edit' | 'create';

type AppFormSheetProps = {
  open: boolean;
  mode: AppFormMode;
  selectedApp: App | null;
  selectedIdentifier: AppBundleIdentifier | null;
  hasPersistedDraft: boolean;
  onSelectedIdentifierChange: (identifier: AppBundleIdentifier | null) => void;
  onOpenChange: (open: boolean) => void;
};

export function AppFormSheet(props: AppFormSheetProps) {
  const formIdentity = `${props.mode}-${props.selectedIdentifier?.draftId ?? props.selectedIdentifier?.appName ?? 'new'}`;

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
  selectedIdentifier,
  hasPersistedDraft,
  onSelectedIdentifierChange,
  onOpenChange,
}: AppFormSheetProps) {
  const [draftExists, setDraftExists] = useState(hasPersistedDraft);
  const [watchedBundle, setWatchedBundle] = useState<AppBundleSchema>();
  const [watchError, setWatchError] = useState<Error | null>(null);
  const [isWatchingInitialBundle, setIsWatchingInitialBundle] = useState(false);
  const hasAvailableDraft = hasPersistedDraft || draftExists;
  const draftIdentifier =
    selectedIdentifier && isDraftAppBundleIdentifier(selectedIdentifier)
      ? selectedIdentifier
      : null;
  const appIdentifier =
    selectedIdentifier && !isDraftAppBundleIdentifier(selectedIdentifier)
      ? selectedIdentifier
      : null;

  const persistedDraftQuery = useQuery({
    ...appOrpc.apps.getApp.queryOptions({
      input: draftIdentifier ?? { draftId: '' },
    }),
    enabled: open && mode === 'create' && draftIdentifier !== null && hasPersistedDraft,
  });

  const createDraftMutation = useMutation(
    controlPlaneOrpc.apps.create.mutationOptions(),
  );
  const updateDraftMutation = useMutation(
    controlPlaneOrpc.apps.update.mutationOptions(),
  );

  const currentData =
    watchedBundle ??
    (mode === 'create'
      ? hasPersistedDraft
        ? persistedDraftQuery.data
        : undefined
      : selectedApp
        ? {
            app: selectedApp.app,
            additionalResources: selectedApp.additionalResources,
          }
        : defaultAppBundleData);

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

    if (draftIdentifier === null) {
      return defaultAppBundleData;
    }

    if (!hasPersistedDraft) {
      return createDefaultDraftBundle(draftIdentifier.draftId);
    }

    if (persistedDraftQuery.data) {
      return persistedDraftQuery.data;
    }

    const draftResult =
      persistedDraftQuery.data ?? (await persistedDraftQuery.refetch()).data;

    if (draftResult) {
      return draftResult;
    }

    return createDefaultDraftBundle(draftIdentifier.draftId);
  };

  const form = useApplicationForm({
    data: currentData,
    mode,
    defaultValues,
    onPublishSuccess: async () => {
      if (!draftIdentifier) {
        onOpenChange(false);
        return;
      }

      onSelectedIdentifierChange(null);
      onOpenChange(false);
    },
  });
  const appDropArea = useAppDropArea({ form: form.form });

  useEffect(() => {
    setDraftExists(hasPersistedDraft);
  }, [draftIdentifier, hasPersistedDraft]);

  useEffect(() => {
    setWatchedBundle(undefined);
    setWatchError(null);
    setIsWatchingInitialBundle(false);
  }, [mode, selectedIdentifier]);

  const ensureDraftExists = async () => {
    if (
      mode !== 'create' ||
      draftIdentifier === null ||
      hasAvailableDraft ||
      createDraftMutation.isPending
    ) {
      return;
    }

    await createDraftMutation.mutateAsync(
      createDefaultDraftBundle(draftIdentifier.draftId),
    );
    setDraftExists(true);
  };

  useEffect(() => {
    if (!open || mode !== 'create' || !draftIdentifier) {
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
    draftIdentifier,
    updateDraftMutation,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const watchTarget =
      mode === 'create'
        ? open && draftIdentifier !== null && hasAvailableDraft
          ? draftIdentifier
          : null
        : open && appIdentifier !== null
          ? appIdentifier
          : null;

    if (!watchTarget) {
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    setWatchError(null);
    setIsWatchingInitialBundle(mode === 'create');

    void (async () => {
      try {
        const iterator = await appOrpcClient.apps.watchApp(watchTarget, {
          signal: controller.signal,
        });

        for await (const bundle of iterator) {
          if (!isActive) {
            return;
          }

          setIsWatchingInitialBundle(false);

          if (isEqual(bundle, form.form.getValues())) {
            continue;
          }

          setWatchedBundle(bundle);
        }
      } catch (error) {
        if (!isActive || controller.signal.aborted) {
          return;
        }

        setIsWatchingInitialBundle(false);
        setWatchError(
          error instanceof Error
            ? error
            : new Error('Unable to watch the app on disk.'),
        );
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    form.form,
    hasAvailableDraft,
    mode,
    open,
    appIdentifier,
    draftIdentifier,
  ]);

  const isFormLoading =
    form.form.formState.isLoading ||
    (mode === 'create' && draftIdentifier === null) ||
    isWatchingInitialBundle;
  const openTargetIdentifier =
    mode === 'create' ? draftIdentifier : appIdentifier;

  const isOpenDisabled =
    openTargetIdentifier === null ||
    createDraftMutation.isPending ||
    updateDraftMutation.isPending;

  return (
    <>
      {mode === 'create' && (persistedDraftQuery.error || watchError) ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Draft sync failed</AlertTitle>
          <AlertDescription>
            {(persistedDraftQuery.error ?? watchError) instanceof Error
              ? (persistedDraftQuery.error ?? watchError)?.message
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
                : (selectedApp?.app.metadata.name ?? appIdentifier?.appName)}
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
