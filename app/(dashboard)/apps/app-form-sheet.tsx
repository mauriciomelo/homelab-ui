'use client';

import { useEffect, useRef } from 'react';
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
import { defaultAppData, type AppSchema } from '@/app/api/schemas';
import type { App } from '@/app/api/applications';
import { ApplicationForm, useApplicationForm } from './application-form';
import { AppDropArea, useAppDropArea } from './app-drop-area';

export type AppFormMode = 'edit' | 'create';

type AppFormSheetProps = {
  open: boolean;
  mode: AppFormMode;
  selectedApp: App | null;
  selectedAppName: string | null;
  onOpenChange: (open: boolean) => void;
};

export function AppFormSheet({
  open,
  mode,
  selectedApp,
  selectedAppName,
  onOpenChange,
}: AppFormSheetProps) {
  const formData: AppSchema = selectedApp?.spec ?? defaultAppData;
  const formIdentity = `${mode}-${selectedAppName ?? 'new'}`;

  const form = useApplicationForm({
    data: formData,
    mode,
  });
  const appDropArea = useAppDropArea({ form: form.form });
  const previousFormIdentity = useRef(formIdentity);

  useEffect(() => {
    if (previousFormIdentity.current === formIdentity) {
      return;
    }

    form.form.reset(formData);
    previousFormIdentity.current = formIdentity;
  }, [form.form, formData, formIdentity]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-muted w-[600px] sm:max-w-[600px]">
        <Form {...form.form}>
          <form
            onSubmit={form.onSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <SheetHeader>
              <SheetTitle>
                {mode === 'create'
                  ? 'Create New App'
                  : (selectedApp?.spec.name ?? selectedAppName)}
              </SheetTitle>
              <SheetDescription>
                {mode === 'create'
                  ? 'Configure your new application.'
                  : "Edit the App's configuration."}
              </SheetDescription>
            </SheetHeader>
            <AppDropArea
              className="min-h-0 flex-1"
              {...appDropArea.dropAreaProps}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ApplicationForm key={formIdentity} className="p-4" {...form} />
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
  );
}
