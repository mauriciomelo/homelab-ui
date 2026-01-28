'use client';

import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import {
  InsetGroup,
  InsetInput,
  InsetRow,
  InsetSectionTitle,
} from '@/components/ui/inset-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link2, Plus, Shield, Trash2, Unlink2 } from 'lucide-react';
import type { Lens } from '@hookform/lenses';
import { useController, useWatch } from 'react-hook-form';
import type { FieldArrayWithId } from 'react-hook-form';
import { deriveResourceReferences, type AppSchema } from '@/app/api/schemas';
import { cn } from '@/lib/utils';

type EnvVariable = AppSchema['envVariables'][number];
const authClientKeys = ['client-id', 'client-secret'] as const;
type AuthClientKey = (typeof authClientKeys)[number];
type AuthClientReference = ReturnType<typeof deriveResourceReferences>[number];
type EnvVariableWithSecret = Extract<
  EnvVariable,
  {
    valueFrom: {
      secretKeyRef: {
        name: string;
        key: string;
      };
    };
  }
>;

type EnvVariableValueFieldProps = {
  lens: Lens<EnvVariable>;
  fieldClassName: string;
};

type AuthClientLinkMenuProps = {
  lens: Lens<EnvVariable>;
  index: number;
  authClientReferences: AuthClientReference[];
  onLinkSelect: (index: number, name: string, key: AuthClientKey) => void;
  onLinkClear: (index: number) => void;
};

type UseAuthClientEnvLinksArgs = {
  envVariablesLens: Lens<AppSchema['envVariables']>;
  additionalResourcesLens: Lens<AppSchema['additionalResources']>;
};

const authClientKeyLabels = {
  'client-id': 'Client ID',
  'client-secret': 'Client Secret',
} satisfies Record<AuthClientKey, string>;

const hasSecretRef = (
  envVariable: EnvVariable | undefined,
): envVariable is EnvVariableWithSecret =>
  Boolean(envVariable && 'valueFrom' in envVariable);

const isAuthClientKey = (value: string): value is AuthClientKey =>
  authClientKeys.some((key) => key === value);

function useAuthClientEnvLinks({
  envVariablesLens,
  additionalResourcesLens,
}: UseAuthClientEnvLinksArgs) {
  const { control: resourcesControl, name: resourcesName } =
    additionalResourcesLens.interop();
  const { control: envControl, name: envName } = envVariablesLens.interop();

  const additionalResources =
    useWatch({
      control: resourcesControl,
      name: resourcesName,
    }) ?? [];
  const envVariables =
    useWatch({
      control: envControl,
      name: envName,
    }) ?? [];
  const { field: envVariablesField } = useController({
    control: envControl,
    name: envName,
  });
  const authClientReferences = deriveResourceReferences(additionalResources);

  const handleEnvLinkSelect = (
    index: number,
    name: string,
    key: AuthClientKey,
  ) => {
    const currentName = envVariables[index]?.name ?? '';
    const nextVariables = envVariables.map((variable, envIndex) =>
      envIndex === index
        ? {
            name: currentName,
            valueFrom: {
              secretKeyRef: {
                name,
                key,
              },
            },
          }
        : variable,
    );
    envVariablesField.onChange(nextVariables);
  };

  const handleEnvLinkClear = (index: number) => {
    const currentName = envVariables[index]?.name ?? '';
    const currentValue =
      envVariables[index] && 'value' in envVariables[index]
        ? envVariables[index].value
        : '';
    const nextVariables = envVariables.map((variable, envIndex) =>
      envIndex === index
        ? {
            name: currentName,
            value: currentValue ?? '',
          }
        : variable,
    );
    envVariablesField.onChange(nextVariables);
  };

  return {
    authClientReferences,
    handleEnvLinkSelect,
    handleEnvLinkClear,
  };
}

function EnvVariableValueField({
  lens,
  fieldClassName,
}: EnvVariableValueFieldProps) {
  const { control, name } = lens.interop();
  const envVariable = useWatch({ control, name });
  const valueInterop = lens.focus('value').interop();

  const linkedSecret = hasSecretRef(envVariable)
    ? envVariable.valueFrom.secretKeyRef
    : undefined;
  const linkedKeyLabel =
    linkedSecret && isAuthClientKey(linkedSecret.key)
      ? authClientKeyLabels[linkedSecret.key]
      : '';
  return (
    <FormField
      control={valueInterop.control}
      name={valueInterop.name}
      render={({ field }) => {
        const displayValue = field.value ?? '';

        return (
          <FormItem className="w-0 min-w-0 flex-1 grow">
            <FormControl>
              {linkedSecret ? (
                <div className="w-full">
                  <input type="hidden" {...field} value={displayValue} />
                  <div
                    className={cn(
                      fieldClassName,
                      'flex h-9 w-full items-center gap-2 overflow-hidden rounded-md border border-dashed bg-blue-50/70 px-2.5 text-sm font-medium text-slate-900',
                    )}
                  >
                    <span className="bg-background flex size-6 items-center justify-center rounded-full border text-blue-600">
                      <Shield className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="shrink-0">{linkedKeyLabel}</span>
                      <span className="text-muted-foreground shrink-0">/</span>
                      <span className="text-muted-foreground min-w-0 truncate text-xs">
                        {linkedSecret.name}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <Input
                  placeholder="value"
                  className={cn(fieldClassName)}
                  type="text"
                  {...field}
                  value={displayValue}
                />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function AuthClientLinkMenu({
  lens,
  index,
  authClientReferences,
  onLinkSelect,
  onLinkClear,
}: AuthClientLinkMenuProps) {
  const { control, name } = lens.interop();
  const envVariable = useWatch({ control, name });
  const isLinked = hasSecretRef(envVariable);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Link secret"
          className={cn(
            'h-9 w-9 transition-colors',
            isLinked
              ? 'bg-blue-50/70 text-blue-700 ring-1 ring-blue-200'
              : 'text-muted-foreground',
          )}
        >
          <Link2
            className={cn(
              'h-4 w-4 transition-colors',
              isLinked ? 'text-blue-700' : 'text-muted-foreground',
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onLinkClear(index)}>
          <Unlink2 className="text-muted-foreground h-4 w-4" />
          Unlink
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {authClientReferences.length === 0 ? (
          <DropdownMenuItem disabled>
            No auth clients available
          </DropdownMenuItem>
        ) : (
          authClientReferences.map((reference, authIndex) => (
            <div key={reference.name}>
              <DropdownMenuLabel className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide uppercase">
                <Shield className="h-4 w-4" />
                {reference.name}
              </DropdownMenuLabel>
              {reference.keys.map((key) => (
                <DropdownMenuItem
                  key={`${reference.name}-${key}`}
                  onSelect={() => onLinkSelect(index, reference.name, key)}
                >
                  <div className="flex flex-col">
                    <span>{authClientKeyLabels[key]}</span>
                    <span className="text-muted-foreground text-xs">
                      {reference.name}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
              {authIndex < authClientReferences.length - 1 ? (
                <DropdownMenuSeparator />
              ) : null}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type EnvironmentVariablesSectionProps = {
  envVariablesLens: Lens<AppSchema['envVariables']>;
  additionalResourcesLens: Lens<AppSchema['additionalResources']>;
  fields: FieldArrayWithId<AppSchema, 'envVariables', 'id'>[];
  onAdd: () => void;
  onRemove: (index: number) => void;
};

export function EnvironmentVariablesSection({
  envVariablesLens,
  additionalResourcesLens,
  fields,
  onAdd,
  onRemove,
}: EnvironmentVariablesSectionProps) {
  const { authClientReferences, handleEnvLinkSelect, handleEnvLinkClear } =
    useAuthClientEnvLinks({ envVariablesLens, additionalResourcesLens });
  const { control, name } = envVariablesLens.interop();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <InsetSectionTitle id="env-vars-title" className="pb-0">
          Environment Variables
        </InsetSectionTitle>
        <Button
          type="button"
          variant="ghost"
          onClick={onAdd}
          className="h-6 px-2 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Variable
        </Button>
      </div>
      <FormField
        control={control}
        name={name}
        render={() => {
          const fieldClassName =
            'h-auto py-1 border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 font-mono text-sm shadow-none focus-visible:ring-0';
          return (
            <InsetGroup role="group" aria-labelledby="env-vars-title">
              {fields.length > 0 && (
                <div className="bg-muted/50 text-muted-foreground flex items-center gap-4 px-4 py-2 text-xs font-medium">
                  <span className="w-[200px]">Name</span>
                  <span className="flex-1">Value</span>
                  <div className="w-16" />
                </div>
              )}
              {fields.map((item, index) => {
                const envVariableLens = envVariablesLens.focus(index).defined();
                const nameInterop = envVariableLens.focus('name').interop();

                return (
                  <InsetRow key={item.id}>
                    <FormField
                      control={nameInterop.control}
                      name={nameInterop.name}
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <FormControl>
                            <InsetInput
                              placeholder="VARIABLE_NAME"
                              className={cn(
                                fieldClassName,
                                'w-[200px] text-left font-semibold text-blue-700',
                              )}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <EnvVariableValueField
                        lens={envVariableLens}
                        fieldClassName={fieldClassName}
                      />
                      <AuthClientLinkMenu
                        index={index}
                        lens={envVariableLens}
                        authClientReferences={authClientReferences}
                        onLinkSelect={handleEnvLinkSelect}
                        onLinkClear={handleEnvLinkClear}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(index)}
                      disabled={fields.length === 1}
                      className="text-muted-foreground h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </InsetRow>
                );
              })}
              {fields.length === 0 && (
                <div className="text-muted-foreground p-8 text-center text-sm">
                  No environment variables defined.
                </div>
              )}
            </InsetGroup>
          );
        }}
      />
    </div>
  );
}
