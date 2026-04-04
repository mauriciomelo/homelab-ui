'use client';

import { useEffect } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  appBundleSchema,
  defaultAppBundleData,
  type AppBundleSchema,
} from '@/app/api/schemas';
import { ApplicationForm, useApplicationForm } from './application-form';
import { AppDropArea, useAppDropArea } from './app-drop-area';
import { appOrpc, appOrpcClient } from '@/app-orpc/client';
import {
  experimental_streamedQuery as streamedQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { OpenWithMenu } from './open-with-menu';
import { produce } from 'immer';

export type AppFormMode = 'edit' | 'create';

export type AppFormSheetSession =
  | {
      mode: 'create';
      identifier: { draftId: string; persisted: boolean };
      initialData?: AppBundleSchema;
    }
  | {
      mode: 'edit';
      identifier: { appName: string };
      initialData: AppBundleSchema;
    };

type AppFormSheetProps = {
  open: boolean;
  session: AppFormSheetSession | null;
  onSessionChange: (session: AppFormSheetSession | null) => void;
  onOpenChange: (open: boolean) => void;
};

function getFormIdentity(session: AppFormSheetSession | null) {
  if (!session) {
    return 'closed-new';
  }

  if (session.mode === 'create') {
    return `create-${session.identifier.draftId}`;
  }

  return `edit-${session.identifier.appName}`;
}

function getSheetTitle({
  mode,
  currentData,
  appIdentifier,
}: {
  mode: AppFormMode;
  currentData?: AppBundleSchema;
  appIdentifier: { appName: string } | null;
}) {
  if (mode === 'create') {
    return 'Create New App';
  }

  return currentData?.app.metadata.name ?? appIdentifier?.appName;
}

function getSheetDescription(mode: AppFormMode) {
  return mode === 'create'
    ? 'Configure your new application.'
    : "Edit the App's configuration.";
}

function getLoadingMessage(mode: AppFormMode) {
  return mode === 'create'
    ? 'Preparing draft workspace...'
    : 'Loading application...';
}

function getEmptyStateMessage(mode: AppFormMode) {
  return mode === 'create'
    ? 'Unable to prepare the draft form.'
    : 'Unable to load the application form.';
}

function getErrorTitle(mode: AppFormMode) {
  return mode === 'create' ? 'Draft sync failed' : 'App load failed';
}

function getErrorDescription({
  mode,
  isEditModeMissingApp,
  appIdentifier,
  error,
}: {
  mode: AppFormMode;
  isEditModeMissingApp: boolean;
  appIdentifier: { appName: string } | null;
  error: Error | null;
}) {
  if (isEditModeMissingApp) {
    return `Unable to find app "${appIdentifier?.appName}".`;
  }

  if (error) {
    return error.message;
  }

  return mode === 'create'
    ? 'Unable to read the draft from disk.'
    : 'Unable to read the app from disk.';
}

function getWatchQueryKey({
  mode,
  draftIdentifier,
  appIdentifier,
}: {
  mode: AppFormMode;
  draftIdentifier: { draftId: string } | null;
  appIdentifier: { appName: string } | null;
}) {
  if (mode === 'create') {
    return ['watch-app', 'draft', draftIdentifier?.draftId] as const;
  }

  return ['watch-app', 'app', appIdentifier?.appName] as const;
}

function getCurrentData({
  watchedBundle,
  initialData,
  mode,
  draftIdentifier,
}: {
  watchedBundle?: AppBundleSchema;
  initialData?: AppBundleSchema;
  mode: AppFormMode;
  draftIdentifier: { draftId: string } | null;
}) {
  if (watchedBundle) {
    return watchedBundle;
  }

  if (initialData) {
    return initialData;
  }

  if (mode === 'create') {
    return createDefaultDraftBundle(draftIdentifier?.draftId ?? null);
  }

  return undefined;
}

function getInitialWatchedBundle({
  initialData,
  mode,
  draftIdentifier,
}: {
  initialData?: AppBundleSchema;
  mode: AppFormMode;
  draftIdentifier: { draftId: string } | null;
}) {
  if (initialData) {
    return initialData;
  }

  if (mode === 'create') {
    return createDefaultDraftBundle(draftIdentifier?.draftId ?? null);
  }

  return undefined;
}

function getQueryError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (error) {
    return new Error('Unable to watch the app on disk.');
  }

  return null;
}

type DraftMutation = {
  isPending: boolean;
  isSuccess: boolean;
  mutate: (bundle: AppBundleSchema) => void;
  mutateAsync: (bundle: AppBundleSchema) => Promise<unknown>;
};

function ensureDraftExistsIfNeeded({
  mode,
  draftIdentifier,
  hasPersistedDraft,
  createDraftMutation,
}: {
  mode: AppFormMode;
  draftIdentifier: { draftId: string } | null;
  hasPersistedDraft: boolean;
  createDraftMutation: DraftMutation;
}): Promise<void> {
  if (
    mode !== 'create' ||
    draftIdentifier === null ||
    hasPersistedDraft ||
    createDraftMutation.isPending
  ) {
    return Promise.resolve();
  }

  return createDraftMutation
    .mutateAsync(createDefaultDraftBundle(draftIdentifier.draftId))
    .then(() => undefined);
}

function persistDraftFromValues({
  values,
  hasPersistedDraft,
  createDraftMutation,
  updateDraftMutation,
}: {
  values: unknown;
  hasPersistedDraft: boolean;
  createDraftMutation: DraftMutation;
  updateDraftMutation: DraftMutation;
}) {
  const parsedBundle = appBundleSchema.safeParse(values);

  if (!parsedBundle.success) {
    return;
  }

  if (hasPersistedDraft) {
    updateDraftMutation.mutate(parsedBundle.data);
    return;
  }

  createDraftMutation.mutate(parsedBundle.data);
}

function getIsEditModeMissingApp({
  mode,
  queryPending,
  queryError,
  formLoading,
  currentData,
}: {
  mode: AppFormMode;
  queryPending: boolean;
  queryError: unknown;
  formLoading: boolean;
  currentData?: AppBundleSchema;
}) {
  return (
    mode === 'edit' &&
    !queryError &&
    !queryPending &&
    !formLoading &&
    !currentData
  );
}

function getIsFormLoading({
  mode,
  formLoading,
  draftIdentifier,
  queryPending,
  currentData,
  hasPersistedDraft,
}: {
  mode: AppFormMode;
  formLoading: boolean;
  draftIdentifier: { draftId: string } | null;
  queryPending: boolean;
  currentData?: AppBundleSchema;
  hasPersistedDraft: boolean;
}) {
  return (
    formLoading ||
    (mode === 'create' && draftIdentifier === null) ||
    (mode === 'edit' && queryPending && !currentData) ||
    (mode === 'create' && hasPersistedDraft && queryPending)
  );
}

function FormBodyContent({
  isFormLoading,
  currentData,
  loadingMessage,
  emptyStateMessage,
  form,
}: {
  isFormLoading: boolean;
  currentData?: AppBundleSchema;
  loadingMessage: string;
  emptyStateMessage: string;
  form: ReturnType<typeof useApplicationForm>;
}) {
  if (isFormLoading) {
    return (
      <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center p-4 text-sm">
        {loadingMessage}
      </div>
    );
  }

  if (!currentData) {
    return (
      <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center p-4 text-sm">
        {emptyStateMessage}
      </div>
    );
  }

  return <ApplicationForm className="p-4" {...form} />;
}

function SubmitActionButton({
  isSubmitting,
  mode,
}: {
  isSubmitting: boolean;
  mode: AppFormMode;
}) {
  if (isSubmitting) {
    return (
      <Button type="submit" disabled>
        {mode === 'create' ? 'Creating...' : 'Updating...'}
      </Button>
    );
  }

  return <Button type="submit">{mode === 'create' ? 'Create' : 'Update'}</Button>;
}

export function AppFormSheet(props: AppFormSheetProps) {
  const formIdentity = getFormIdentity(props.session);

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="bg-muted w-[680px] sm:max-w-[680px]"
      >
        {props.open && props.session ? (
          <AppFormSheetBody key={formIdentity} {...props} session={props.session} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AppFormSheetBody({
  open,
  session,
  onSessionChange,
  onOpenChange,
}: AppFormSheetProps & { session: AppFormSheetSession }) {
  const { mode } = session;
  const draftSession = session.mode === 'create' ? session.identifier : null;
  const draftIdentifier =
    draftSession === null ? null : { draftId: draftSession.draftId };
  const appIdentifier = session.mode === 'edit' ? session.identifier : null;
  const initialData = session.initialData;
  const createDraftMutation = useMutation(
    appOrpc.apps.create.mutationOptions(),
  );
  const updateDraftMutation = useMutation(
    appOrpc.apps.update.mutationOptions(),
  );
  const hasPersistedDraft =
    mode === 'create' &&
    draftSession !== null &&
    (draftSession.persisted || createDraftMutation.isSuccess);
  const watchEnabled = open && (mode === 'edit' || hasPersistedDraft);
  const watchIdentifier = mode === 'create' ? draftIdentifier : appIdentifier;
  const initialWatchedBundle = getInitialWatchedBundle({
    initialData,
    mode,
    draftIdentifier,
  });
  const watchedBundlesQuery = useQuery({
    queryKey: getWatchQueryKey({ mode, draftIdentifier, appIdentifier }),
    enabled: watchEnabled,
    retry: false,
    queryFn: streamedQuery<AppBundleSchema, AppBundleSchema | undefined>({
      streamFn: async () => {
        if (!watchIdentifier) {
          throw new Error('Unable to determine which app to watch.');
        }

        return appOrpcClient.apps.watchApp(watchIdentifier);
      },
      initialValue: initialWatchedBundle,
      reducer: (_previous, nextBundle) => nextBundle,
      refetchMode: 'reset',
    }),
  });
  const watchedBundle = watchedBundlesQuery.data;
  const currentData = getCurrentData({
    watchedBundle,
    initialData,
    mode,
    draftIdentifier,
  });
  const defaultValues = currentData ?? defaultAppBundleData;

  const form = useApplicationForm({
    data: currentData,
    mode,
    defaultValues,
    onPublishSuccess: async () => {
      if (!draftIdentifier) {
        onOpenChange(false);
        return;
      }

      onSessionChange(null);
      onOpenChange(false);
    },
  });
  const appDropArea = useAppDropArea({ form: form.form });

  const ensureDraftExists = () =>
    ensureDraftExistsIfNeeded({
      mode,
      draftIdentifier,
      hasPersistedDraft,
      createDraftMutation,
    });

  const handleDraftWatchChange = ({
    type,
    values,
  }: {
    type: unknown;
    values: unknown;
  }) => {
    if (type !== 'change') {
      return;
    }

    persistDraftFromValues({
      values,
      hasPersistedDraft,
      createDraftMutation,
      updateDraftMutation,
    });
  };

  useEffect(() => {
    if (!open || mode !== 'create' || !draftIdentifier) {
      return;
    }

    const subscription = form.form.watch((values, { type }) => {
      handleDraftWatchChange({ type, values });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    createDraftMutation,
    form.form,
    hasPersistedDraft,
    handleDraftWatchChange,
    mode,
    open,
    draftIdentifier,
  ]);

  const isEditModeMissingApp = getIsEditModeMissingApp({
    mode,
    queryPending: watchedBundlesQuery.isPending,
    queryError: watchedBundlesQuery.error,
    formLoading: form.form.formState.isLoading,
    currentData,
  });
  const isFormLoading = getIsFormLoading({
    mode,
    formLoading: form.form.formState.isLoading,
    draftIdentifier,
    queryPending: watchedBundlesQuery.isPending,
    currentData,
    hasPersistedDraft,
  });
  const openTargetIdentifier = mode === 'create' ? draftIdentifier : appIdentifier;

  const isOpenDisabled =
    openTargetIdentifier === null ||
    createDraftMutation.isPending ||
    updateDraftMutation.isPending;
  const displayedError = getQueryError(watchedBundlesQuery.error);
  const showError = displayedError !== null || isEditModeMissingApp;
  const title = getSheetTitle({ mode, currentData, appIdentifier });
  const description = getSheetDescription(mode);
  const loadingMessage = getLoadingMessage(mode);
  const emptyStateMessage = getEmptyStateMessage(mode);
  const errorTitle = getErrorTitle(mode);
  const errorDescription = getErrorDescription({
    mode,
    isEditModeMissingApp,
    appIdentifier,
    error: displayedError,
  });

  return (
    <>
      {showError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{errorTitle}</AlertTitle>
          <AlertDescription>{errorDescription}</AlertDescription>
        </Alert>
      ) : null}
      <Form {...form.form}>
        <form onSubmit={form.onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SheetTitle>{title}</SheetTitle>
              <OpenWithMenu
                targetIdentifier={openTargetIdentifier}
                disabled={isOpenDisabled}
                beforeOpen={mode === 'create' ? ensureDraftExists : undefined}
              />
            </div>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <AppDropArea className="min-h-0 flex-1" {...appDropArea.dropAreaProps}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FormBodyContent
                isFormLoading={isFormLoading}
                currentData={currentData}
                loadingMessage={loadingMessage}
                emptyStateMessage={emptyStateMessage}
                form={form}
              />
            </div>
          </AppDropArea>

          <SheetFooter className="flex-row justify-end">
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </SheetClose>
            <SubmitActionButton
              isSubmitting={form.form.formState.isSubmitting}
              mode={form.mode}
            />
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
