'use client';

import { useState } from 'react';
import { FieldError, useController, useWatch } from 'react-hook-form';
import { type Lens } from '@hookform/lenses';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Trash2, ChevronRight } from 'lucide-react';
import { AuthClientSchema } from '@/app/api/schemas';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import {
  InsetGroup,
  InsetRow,
  InsetLabel,
  InsetInput,
} from '@/components/ui/inset-group';

const formatUriList = (value?: string[]) =>
  value?.length ? value.join(',\n') : '';

const parseUriList = (value: string) =>
  value
    .split(/,|\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export function AuthClientCard({
  lens,
  index,
  onRemove,
}: {
  lens: Lens<AuthClientSchema>;
  index: number;
  onRemove: (index: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const { control, name } = lens.interop();
  const resource = useWatch({ control, name });
  const [redirectUrisInput, setRedirectUrisInput] = useState(() =>
    formatUriList(resource?.spec?.redirectUris),
  );
  const [postLogoutUrisInput, setPostLogoutUrisInput] = useState(() =>
    formatUriList(resource?.spec?.postLogoutRedirectUris),
  );

  const nameInterop = lens.focus('metadata').focus('name').interop();
  const redirectUrisInterop = lens
    .focus('spec')
    .focus('redirectUris')
    .interop();
  const postLogoutUrisInterop = lens
    .focus('spec')
    .focus('postLogoutRedirectUris')
    .interop();

  const redirectErrorMessage = getErrorMessage(
    useController(redirectUrisInterop).fieldState.error,
  );
  const postLogoutErrorMessage = getErrorMessage(
    useController(postLogoutUrisInterop).fieldState.error,
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <InsetGroup role="group" aria-labelledby={`auth-client-title-${index}`}>
        <div className="flex items-center justify-between p-3 bg-muted/30">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex flex-1 cursor-pointer items-center gap-2 text-left outline-none"
            >
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform text-muted-foreground',
                  isOpen && 'rotate-90',
                )}
              />
              <Shield className="text-muted-foreground h-4 w-4" />
              <span
                id={`auth-client-title-${index}`}
                className="text-sm font-medium"
              >
                Auth Client
                {resource?.metadata?.name && (
                  <span className="text-muted-foreground ml-1 font-normal truncate">
                    — {resource.metadata.name}
                  </span>
                )}
              </span>
            </button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove Auth Client"
            onClick={() => onRemove(index)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <CollapsibleContent className="divide-y">
          <FormField
            control={nameInterop.control}
            name={nameInterop.name}
            render={({ field }) => (
              <InsetRow asChild>
                <FormItem className="space-y-0">
                  <InsetLabel asChild>
                    <FormLabel>Name</FormLabel>
                  </InsetLabel>
                  <FormControl>
                    <InsetInput className="text-left" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </InsetRow>
            )}
          />
          <FormField
            control={redirectUrisInterop.control}
            name={redirectUrisInterop.name}
            render={({ field }) => (
              <InsetRow className="items-start" asChild>
                <FormItem className="space-y-0">
                  <InsetLabel className="pt-2" asChild>
                    <FormLabel>Redirect URIs</FormLabel>
                  </InsetLabel>
                  <div className="flex-1 space-y-1">
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[88px] resize-y border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 shadow-none focus-visible:ring-0 text-sm"
                        value={redirectUrisInput}
                        aria-invalid={!!redirectErrorMessage}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setRedirectUrisInput(nextValue);
                          field.onChange(parseUriList(nextValue));
                        }}
                        onBlur={(event) => {
                          field.onBlur();
                          setRedirectUrisInput(
                            formatUriList(parseUriList(event.target.value)),
                          );
                        }}
                      />
                    </FormControl>
                    {redirectErrorMessage ? (
                      <p className="text-destructive text-sm">
                        {redirectErrorMessage}
                      </p>
                    ) : (
                      <FormDescription className="text-xs">
                        Comma-separated redirect URIs.
                      </FormDescription>
                    )}
                  </div>
                </FormItem>
              </InsetRow>
            )}
          />
          <FormField
            control={postLogoutUrisInterop.control}
            name={postLogoutUrisInterop.name}
            render={({ field }) => (
              <InsetRow className="items-start" asChild>
                <FormItem className="space-y-0">
                  <InsetLabel className="pt-2" asChild>
                    <FormLabel>Post-logout URIs</FormLabel>
                  </InsetLabel>
                  <div className="flex-1 space-y-1">
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[88px] resize-y border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 shadow-none focus-visible:ring-0 text-sm"
                        value={postLogoutUrisInput}
                        aria-invalid={!!postLogoutErrorMessage}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setPostLogoutUrisInput(nextValue);
                          field.onChange(parseUriList(nextValue));
                        }}
                        onBlur={(event) => {
                          field.onBlur();
                          setPostLogoutUrisInput(
                            formatUriList(parseUriList(event.target.value)),
                          );
                        }}
                      />
                    </FormControl>
                    {postLogoutErrorMessage ? (
                      <p className="text-destructive text-sm">
                        {postLogoutErrorMessage}
                      </p>
                    ) : (
                      <FormDescription className="text-xs">
                        Optional comma-separated post-logout redirect URIs.
                      </FormDescription>
                    )}
                  </div>
                </FormItem>
              </InsetRow>
            )}
          />
        </CollapsibleContent>
      </InsetGroup>
    </Collapsible>
  );
}

function getErrorMessage(error: FieldError | FieldError[] | undefined) {
  if (Array.isArray(error)) {
    return error.find((e) => !!e?.message)?.message;
  }
  return error?.message;
}
