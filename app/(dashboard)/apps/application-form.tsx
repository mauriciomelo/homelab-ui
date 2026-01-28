'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLens, type Lens } from '@hookform/lenses';
import {
  useFieldArray,
  useForm,
  useController,
  useWatch,
} from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Loader2Icon,
  Globe,
  Package,
  Plus,
  Rocket,
  Trash2,
  Link2,
  Shield,
  Unlink2,
  HardDrive,
  HelpCircle,
  Activity,
} from 'lucide-react';
import type { App } from '@/app/api/applications';
import {
  AppSchema,
  appSchema,
  deriveResourceReferences,
  type PersistentVolumeClaimSchema,
} from '@/app/api/schemas';
import { updateApp } from './actions';
import { Separator } from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  InsetGroup,
  InsetSectionTitle,
  InsetRow,
  InsetLabel,
  InsetInput,
} from '@/components/ui/inset-group';
import { createApp } from './actions';
import { AuthClientCard } from './auth-client-card';
import { ResourceLimitsField, sizeToResource } from './resource-limits-field';
import { PersistentVolumeClaimCard } from './persistent-volume-claim-card';
import { VolumeMountsSection } from './volume-mounts-section';

type FormMode = 'edit' | 'create';
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
  lens: Lens<AppSchema>;
};

const basePersistentVolumeName = 'data';

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

const getNextPersistentVolumeName = (
  persistentVolumeClaims: PersistentVolumeClaimSchema[],
) => {
  const existingNames = new Set(
    persistentVolumeClaims.map((resource) => resource.metadata.name),
  );

  if (!existingNames.has(basePersistentVolumeName)) {
    return basePersistentVolumeName;
  }

  let nextIndex = 2;
  while (existingNames.has(`${basePersistentVolumeName}${nextIndex}`)) {
    nextIndex += 1;
  }

  return `${basePersistentVolumeName}${nextIndex}`;
};

function useAuthClientEnvLinks({ lens }: UseAuthClientEnvLinksArgs) {
  const additionalResourcesInterop = lens
    .focus('additionalResources')
    .interop();
  const envVariablesInterop = lens.focus('envVariables').interop();
  const additionalResources =
    useWatch({
      control: additionalResourcesInterop.control,
      name: additionalResourcesInterop.name,
    }) ?? [];
  const envVariables =
    useWatch({
      control: envVariablesInterop.control,
      name: envVariablesInterop.name,
    }) ?? [];
  const { field: envVariablesField } = useController({
    control: envVariablesInterop.control,
    name: envVariablesInterop.name,
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

const defaultAppData: AppSchema = {
  name: '',
  image: '',
  ports: [{ name: 'http', containerPort: 80 }],
  envVariables: [{ name: '', value: '' }],
  health: {
    check: {
      type: 'httpGet',
      path: '/',
      port: 'http',
    },
  },
  volumeMounts: [],
  resources: {
    limits: sizeToResource.small.limits,
  },
  ingress: {
    port: { name: 'http' },
  },
};

export function ApplicationForm(props: {
  data?: App['spec'];
  mode?: FormMode;
  className?: string;
}) {
  const mode = props.mode ?? 'edit';

  const form = useForm<AppSchema>({
    resolver: zodResolver(appSchema),
    defaultValues: {
      ...defaultAppData,
      ...props.data,
      volumeMounts: props.data?.volumeMounts ?? [],
    },
  });
  const lens = useLens({ control: form.control });
  const additionalResourcesLens = lens.focus('additionalResources').defined();

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'envVariables',
  });

  const {
    fields: additionalResourceFields,
    append: appendAdditionalResource,
    remove: removeAdditionalResource,
  } = useFieldArray({
    control: form.control,
    name: 'additionalResources',
  });

  const {
    fields: portFields,
    append: appendPort,
    remove: removePort,
  } = useFieldArray({
    control: form.control,
    name: 'ports',
  });

  const {
    fields: volumeMountFields,
    append: appendVolumeMount,
    remove: removeVolumeMount,
  } = useFieldArray({
    control: form.control,
    name: 'volumeMounts',
  });

  const ports = useWatch({ control: form.control, name: 'ports' });
  const ingress = useWatch({ control: form.control, name: 'ingress' });
  const additionalResources =
    useWatch({ control: form.control, name: 'additionalResources' }) ?? [];
  const persistentVolumeClaims = additionalResources.filter(
    (resource): resource is PersistentVolumeClaimSchema =>
      resource.kind === 'PersistentVolumeClaim',
  );
  const { authClientReferences, handleEnvLinkSelect, handleEnvLinkClear } =
    useAuthClientEnvLinks({ lens });

  const addEnvVariable = () => {
    append({ name: '', value: '' });
  };

  const removeEnvVariable = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const addPort = () => {
    appendPort({ name: '', containerPort: 80 });
  };

  const addVolumeMount = () => {
    appendVolumeMount({ mountPath: '', name: '' });
  };

  const addAuthClientResource = () => {
    const newAuthClient: NonNullable<AppSchema['additionalResources']>[number] =
      {
        apiVersion: 'tesselar.io/v1',
        kind: 'AuthClient',
        metadata: { name: 'authclient' },
        spec: {
          redirectUris: [''],
        },
      };

    appendAdditionalResource(newAuthClient);
  };

  const createPersistentVolumeClaimResource = () => {
    const volumeName = getNextPersistentVolumeName(persistentVolumeClaims);
    const newPersistentVolumeClaim: NonNullable<
      AppSchema['additionalResources']
    >[number] = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: volumeName },
      spec: {
        accessModes: ['ReadWriteOnce'],
        storageClassName: 'longhorn',
        resources: {
          requests: {
            storage: '1Gi',
          },
        },
      },
    };

    appendAdditionalResource(newPersistentVolumeClaim);
    return volumeName;
  };

  const addPersistentVolumeClaimResource = () => {
    createPersistentVolumeClaimResource();
  };

  const handleRemovePort = (index: number) => {
    if (portFields.length > 1) {
      removePort(index);
    }
  };

  return (
    <Form {...form}>
      <form
        className={cn('space-y-8', props.className)}
        onSubmit={form.handleSubmit(async (data) => {
          const payload = {
            ...data,
            additionalResources:
              data.additionalResources && data.additionalResources.length > 0
                ? data.additionalResources
                : undefined,
            volumeMounts:
              data.volumeMounts && data.volumeMounts.length > 0
                ? data.volumeMounts
                : undefined,
          };
          const result =
            mode === 'create'
              ? await createApp(payload)
              : await updateApp(payload);
          console.log(result);
        })}
      >
        <div className="flex flex-col gap-2">
          <InsetSectionTitle id="app-basics-title">
            App Basics
          </InsetSectionTitle>
          <InsetGroup role="group" aria-labelledby="app-basics-title">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <InsetRow asChild>
                  <FormItem className="space-y-0">
                    <InsetLabel asChild>
                      <FormLabel>App Name</FormLabel>
                    </InsetLabel>
                    <FormControl>
                      <InsetInput
                        placeholder="App Name"
                        readOnly={mode === 'edit'}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </InsetRow>
              )}
            />
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <InsetRow asChild>
                  <FormItem className="space-y-0">
                    <InsetLabel asChild>
                      <FormLabel>
                        <Package className="text-muted-foreground h-4 w-4" />
                        Container Image
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="text-muted-foreground h-4 w-4 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Include the full registry path and tag.
                          </TooltipContent>
                        </Tooltip>
                      </FormLabel>
                    </InsetLabel>
                    <div className="flex-1 min-w-0">
                      <FormControl>
                        <InsetInput
                          placeholder="nginx:latest or registry.example.com/my-app:v1.0.0"
                          className="text-base"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  </FormItem>
                </InsetRow>
              )}
            />
          </InsetGroup>
        </div>

        <ResourceLimitsField lens={lens.focus('resources')} />

        <Separator className="my-2" />

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <InsetSectionTitle id="ports-title" className="pb-0">
              Ports
            </InsetSectionTitle>
            <Button
              type="button"
              variant="ghost"
              onClick={addPort}
              className="h-6 px-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              aria-label="Add Port"
              data-testid="add-port-btn"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Port
            </Button>
          </div>
          <InsetGroup role="group" aria-labelledby="ports-title">
            <div className="flex items-center gap-4 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span className="w-1/3">Port Name</span>
              <span className="flex-1">Port Number</span>
              <div className="w-[72px]" />
            </div>
            {portFields.map((item, index) => {
              const currentPortName = ports?.[index]?.name;
              const isWebPort = ingress?.port?.name === currentPortName;

              return (
                <InsetRow key={item.id}>
                  <FormField
                    control={form.control}
                    name={`ports.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="w-1/3 space-y-0">
                        <FormControl>
                          <InsetInput
                            placeholder="http"
                            aria-label="Port Name"
                            data-testid={`port-name-${index}`}
                            className="text-left"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`ports.${index}.containerPort`}
                    render={({ field }) => (
                      <FormItem className="flex-1 space-y-0">
                        <FormControl>
                          <InsetInput
                            placeholder="80"
                            aria-label="Port Number"
                            data-testid={`port-number-${index}`}
                            type="number"
                            className="text-left"
                            {...field}
                            onChange={(event) =>
                              field.onChange(+event.target.value)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (currentPortName) {
                              form.setValue('ingress.port.name', currentPortName);
                            }
                          }}
                          className={cn(
                            'h-8 w-8 transition-colors',
                            isWebPort
                              ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                          aria-pressed={isWebPort}
                          aria-label={
                            isWebPort ? 'Web Port (Active)' : 'Set as Web Port'
                          }
                          data-testid={`web-port-toggle-${index}`}
                        >
                          <Globe className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isWebPort ? 'Web Port (Active)' : 'Set as Web Port'}
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePort(index)}
                      disabled={portFields.length === 1}
                      className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove Port"
                      data-testid={`remove-port-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </InsetRow>
              );
            })}
          </InsetGroup>
        </div>
          <div className="flex flex-col gap-2">
            <InsetSectionTitle id="health-check-title">
              Health Check
            </InsetSectionTitle>
            <InsetGroup role="group" aria-labelledby="health-check-title">
              <div className="flex items-center gap-4 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                <div className="w-8" />
                <span className="w-1/4">Type</span>
                <span className="flex-1">Path</span>
                <span className="w-1/4">Port</span>
              </div>
              <InsetRow>
                <div className="flex w-8 items-center justify-center text-muted-foreground">
                  <Activity className="h-4 w-4" />
                </div>
                <FormField
                  control={form.control}
                  name="health.check.type"
                  render={({ field }) => (
                    <FormItem className="w-1/4 space-y-0">
                      <div className="flex-1 space-y-0">
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? 'httpGet'}
                        >
                          <FormControl>
                            <SelectTrigger
                              aria-label="Type"
                              className="h-auto w-full border-0 bg-transparent px-2 py-1 shadow-none transition-colors hover:bg-muted/50 focus:ring-0"
                            >
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="httpGet">GET</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="health.check.path"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-0">
                      <FormControl>
                        <InsetInput
                          placeholder="/"
                          aria-label="Path"
                          className="text-left"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="health.check.port"
                  render={({ field }) => (
                    <FormItem className="w-1/4 space-y-0">
                      <div className="flex-1 space-y-0">
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ''}
                        >
                          <FormControl>
                            <SelectTrigger
                              aria-label="Port"
                              className="h-auto py-1 w-full border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 shadow-none focus:ring-0 flex gap-2 text-left [&_[data-slot=select-value]]:line-clamp-none"
                            >
                              <SelectValue placeholder="Select a port" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ports?.map(
                              (port, index) =>
                                port.name && (
                                  <SelectItem key={index} value={port.name}>
                                    <span className="font-mono">
                                      {port.name} ({port.containerPort})
                                    </span>
                                  </SelectItem>
                                ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
              </InsetRow>
            </InsetGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <InsetSectionTitle id="env-vars-title" className="pb-0">
                Environment Variables
              </InsetSectionTitle>
              <Button
                type="button"
                variant="ghost"
                onClick={addEnvVariable}
                className="h-6 px-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Variable
              </Button>
            </div>
            <FormField
              control={form.control}
              name="envVariables"
              render={() => {
                const fieldClassName =
                  'h-auto py-1 border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 font-mono text-sm shadow-none focus-visible:ring-0';
                return (
                  <InsetGroup role="group" aria-labelledby="env-vars-title">
                    {fields.length > 0 && (
                      <div className="flex items-center gap-4 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                        <span className="w-[200px]">Name</span>
                        <span className="flex-1">Value</span>
                        <div className="w-16" />
                      </div>
                    )}
                    {fields.map((item, index) => {
                      const envVariableLens = lens
                        .focus('envVariables')
                        .focus(index);

                      return (
                        <InsetRow key={item.id}>
                          <FormField
                            control={form.control}
                            name={`envVariables.${index}.name`}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <InsetInput
                                    placeholder="VARIABLE_NAME"
                                    className={cn(
                                      fieldClassName,
                                      'w-[200px] text-blue-700 font-semibold text-left',
                                    )}
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex-1 flex items-center gap-2 min-w-0">
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
                            onClick={() => removeEnvVariable(index)}
                            disabled={fields.length === 1}
                            className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </InsetRow>
                      );
                    })}
                    {fields.length === 0 && (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        No environment variables defined.
                      </div>
                    )}
                  </InsetGroup>
                );
              }}
            />
          </div>

          <VolumeMountsSection
            lens={lens}
            volumeMountFields={volumeMountFields}
            persistentVolumeClaims={persistentVolumeClaims}
            onAdd={addVolumeMount}
            onRemove={removeVolumeMount}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <InsetSectionTitle
                id="additional-resources-title"
                className="pb-0"
              >
                Additional Resources
              </InsetSectionTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-6 px-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    data-testid="additional-resource-trigger"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Resource
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={addAuthClientResource}>
                    <Shield className="text-muted-foreground h-4 w-4" />
                    Auth Client
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={addPersistentVolumeClaimResource}>
                    <HardDrive className="text-muted-foreground h-4 w-4" />
                    Persistent Volume
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {additionalResourceFields.length ? (
              <div className="space-y-4">
                {additionalResourceFields.map((resourceField, index) => {
                  const resource = additionalResources[index];
                  if (!resource) {
                    return null;
                  }

                  if (resource.kind === 'PersistentVolumeClaim') {
                    return (
                      <PersistentVolumeClaimCard
                        key={resourceField.id}
                        index={index}
                        lens={additionalResourcesLens
                          .focus(index)
                          .narrow('kind', 'PersistentVolumeClaim')}
                        onRemove={removeAdditionalResource}
                      />
                    );
                  }

                  if (resource.kind !== 'AuthClient') {
                    return null;
                  }

                  return (
                    <AuthClientCard
                      key={resourceField.id}
                      index={index}
                      lens={additionalResourcesLens
                        .focus(index)
                        .narrow('kind', 'AuthClient')}
                      onRemove={removeAdditionalResource}
                    />
                  );
                })}
              </div>
            ) : (
              <InsetGroup>
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No additional resources.
                </div>
              </InsetGroup>
            )}
          </div>

        <div className="flex gap-3 pt-4">
          {form.formState.isSubmitting ? (
            <Button type="submit" className="flex-1" disabled>
              <Loader2Icon className="animate-spin" />
              {mode === 'create' ? 'Creating...' : 'Updating...'}
            </Button>
          ) : (
            <Button type="submit" className="flex-1">
              <Rocket className="mr-2 h-4 w-4" />
              {mode === 'create' ? 'Create' : 'Update'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
