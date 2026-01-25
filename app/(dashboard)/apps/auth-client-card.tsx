'use client';

import { useState } from 'react';
import { useFormState, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { KeyRound, Trash2 } from 'lucide-react';
import { AppSchema } from '@/app/api/schemas';

const formatUriList = (value?: string[]) =>
  value?.length ? value.join(', ') : '';

const parseUriList = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export function AuthClientCard({
  control,
  index,
  onRemove,
}: {
  control: Control<AppSchema>;
  index: number;
  onRemove: (index: number) => void;
}) {
  const resource = useWatch({
    control,
    name: `additionalResources.${index}`,
  });
  const [redirectUrisInput, setRedirectUrisInput] = useState(() =>
    formatUriList(resource?.spec?.redirectUris),
  );
  const [postLogoutUrisInput, setPostLogoutUrisInput] = useState(() =>
    formatUriList(resource?.spec?.postLogoutRedirectUris),
  );
  const { errors } = useFormState({ control });
  const redirectErrors =
    errors.additionalResources?.[index]?.spec?.redirectUris;
  const postLogoutErrors =
    errors.additionalResources?.[index]?.spec?.postLogoutRedirectUris;

  const redirectErrorMessage = redirectErrors?.find?.(
    (error) => !!error?.message,
  )?.message;
  const postLogoutErrorMessage = postLogoutErrors?.find?.(
    (error) => !!error?.message,
  )?.message;

  return (
    <div className="border-border/70 bg-background space-y-4 rounded-lg border p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="text-muted-foreground h-4 w-4" />
            <span>Auth Client</span>
          </div>
          <p className="text-muted-foreground text-xs">
            Configure OAuth redirect settings
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove Auth Client"
          onClick={() => onRemove(index)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <FormField
        control={control}
        name={`additionalResources.${index}.metadata.name`}
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel>Auth Client Name</FormLabel>
            <FormControl>
              <Input className="font-mono text-sm" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={`additionalResources.${index}.spec.redirectUris`}
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel>Redirect URI</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                className="min-h-[88px] resize-y"
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
              <p className="text-destructive text-sm">{redirectErrorMessage}</p>
            ) : (
              <FormDescription>Comma-separated redirect URIs.</FormDescription>
            )}
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={`additionalResources.${index}.spec.postLogoutRedirectUris`}
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel>Post-logout URI</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                className="min-h-[88px] resize-y"
                value={postLogoutUrisInput}
                aria-invalid={!!postLogoutErrorMessage}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setPostLogoutUrisInput(nextValue);
                  const parsed = parseUriList(nextValue);
                  field.onChange(parsed.length ? parsed : undefined);
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
              <FormDescription>
                Optional comma-separated post-logout redirect URIs.
              </FormDescription>
            )}
          </FormItem>
        )}
      />
    </div>
  );
}
