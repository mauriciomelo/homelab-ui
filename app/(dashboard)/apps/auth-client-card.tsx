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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Trash2 } from 'lucide-react';
import { AuthClientSchema } from '@/app/api/schemas';

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
    <Card role="group" aria-labelledby={`auth-client-title-${index}`}>
      <CardHeader>
        <CardTitle
          id={`auth-client-title-${index}`}
          className="flex items-center gap-2 text-sm"
        >
          <Shield className="text-muted-foreground h-4 w-4" />
          <span>Auth Client</span>
        </CardTitle>
        <CardDescription>Configure OAuth redirect settings</CardDescription>
        <CardAction>
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
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={nameInterop.control}
          name={nameInterop.name}
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
          control={redirectUrisInterop.control}
          name={redirectUrisInterop.name}
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
                <p className="text-destructive text-sm">
                  {redirectErrorMessage}
                </p>
              ) : (
                <FormDescription>
                  Comma-separated redirect URIs.
                </FormDescription>
              )}
            </FormItem>
          )}
        />
        <FormField
          control={postLogoutUrisInterop.control}
          name={postLogoutUrisInterop.name}
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
      </CardContent>
    </Card>
  );
}

function getErrorMessage(error: FieldError | FieldError[] | undefined) {
  if (Array.isArray(error)) {
    return error.find((e) => !!e?.message)?.message;
  }
  return error?.message;
}
