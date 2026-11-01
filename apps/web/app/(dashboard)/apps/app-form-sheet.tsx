'use client';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { defaultAppBundleData, type AppBundleSchema } from '@/app/api/schemas';
import { ApplicationForm, useApplicationForm } from './application-form';
import { AppDropArea, useAppDropArea } from './app-drop-area';

export type AppFormMode = 'edit' | 'create';
export type AppFormSheetSession =
  | { mode: 'create'; initialData?: AppBundleSchema }
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

export function AppFormSheet(props: AppFormSheetProps) {
  const { session } = props;
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="bg-muted w-[680px] sm:max-w-[680px]"
      >
        {props.open && session ? (
          <AppFormSheetBody
            key={
              session.mode === 'edit' ? session.identifier.appName : 'create'
            }
            {...props}
            session={session}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AppFormSheetBody({
  session,
  onSessionChange,
  onOpenChange,
}: AppFormSheetProps & { session: AppFormSheetSession }) {
  const { mode } = session;
  const form = useApplicationForm({
    mode,
    defaultValues: session.initialData ?? defaultAppBundleData,
    onSaveSuccess: () => {
      onSessionChange(null);
      onOpenChange(false);
    },
  });
  const dropArea = useAppDropArea({ form: form.form });
  const pending = form.form.formState.isSubmitting;
  const idleLabel = mode === 'create' ? 'Create' : 'Update';
  const pendingLabel = mode === 'create' ? 'Creating...' : 'Updating...';
  return (
    <Form {...form.form}>
      <form
        onSubmit={form.onSubmit}
        autoComplete="off"
        className="flex min-h-0 flex-1 flex-col"
      >
        <SheetHeader>
          <SheetTitle>
            {mode === 'create' ? 'Create New App' : session.identifier.appName}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Configure your new application.'
              : "Edit the App's configuration."}
          </SheetDescription>
        </SheetHeader>
        <AppDropArea className="min-h-0 flex-1" {...dropArea.dropAreaProps}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ApplicationForm className="p-4" {...form} />
          </div>
        </AppDropArea>
        {form.form.formState.errors.root?.message ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {form.form.formState.errors.root.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <SheetFooter className="flex-row justify-end">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </SheetClose>
          <Button type="submit" disabled={pending}>
            {pending ? pendingLabel : idleLabel}
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
