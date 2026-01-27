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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Activity,
  Layers,
  List,
  Loader2Icon,
  Globe,
  Package,
  Plug,
  Plus,
  Rocket,
  Trash2,
  Link2,
  Shield,
  Unlink2,
  HardDrive,
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2 text-base font-medium">
                App Name
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="App Name"
                  className="font-mono text-sm"
                  readOnly={mode === 'edit'}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="image"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2 text-base font-medium">
                <Package className="text-muted-foreground h-4 w-4" />
                Container Image
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="nginx:latest or registry.example.com/my-app:v1.0.0"
                  className="font-mono text-base"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Specify the Docker image to deploy. Include the full registry
                path and tag.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <ResourceLimitsField lens={lens.focus('resources')} />

        <Separator className="my-2" />

        <FormField
          control={form.control}
          name="ports"
          render={() => {
            const fieldClassName = 'font-mono text-sm m-0';
            return (
              <Card role="group" aria-labelledby="ports-title">
                <CardHeader>
                  <CardTitle
                    id="ports-title"
                    className="flex items-center gap-2 text-base"
                  >
                    <Plug className="text-muted-foreground h-4 w-4" />
                    <span>Ports</span>
                  </CardTitle>
                  <CardAction>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addPort}
                      className="h-9"
                      data-testid="add-port-btn"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Port
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-muted-foreground flex items-center gap-2 px-2 text-xs font-semibold">
                    <span className="w-60">Port Name</span>
                    <span className="flex-1">Port Number</span>
                    <div className="w-9" />
                  </div>
                  <div className="space-y-3">
                    {portFields.map((item, index) => (
                      <div
                        key={item.id}
                        className="border-border/60 bg-background flex items-start gap-2 rounded-md border p-2"
                      >
                        <FormField
                          control={form.control}
                          name={`ports.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  placeholder="http"
                                  data-testid={`port-name-${index}`}
                                  className={cn(fieldClassName, 'w-60')}
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
                            <FormItem className="flex-1 grow">
                              <FormControl>
                                <Input
                                  placeholder="80"
                                  data-testid={`port-number-${index}`}
                                  className={cn(fieldClassName)}
                                  type="number"
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
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={() => handleRemovePort(index)}
                          disabled={portFields.length === 1}
                          className="shrink-0"
                          data-testid={`remove-port-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Separator className="bg-border/70" />
                  <FormField
                    control={form.control}
                    name="ingress.port.name"
                    render={({ field }) => {
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2 text-sm font-medium">
                            <Globe className="text-muted-foreground h-4 w-4" />
                            Web Port
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="ingress-port-select">
                                <SelectValue placeholder="Select a port" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ports?.map(
                                (port, index) =>
                                  port.name && (
                                    <SelectItem
                                      key={index}
                                      value={port.name}
                                      data-testid={`ingress-port-option-${port.name}`}
                                    >
                                      <span className="font-mono">
                                        {port.name} ({port.containerPort})
                                      </span>
                                    </SelectItem>
                                  ),
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select the port to route traffic to.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </CardContent>
              </Card>
            );
          }}
        />
        <Card role="group" aria-labelledby="health-check-title">
          <CardHeader>
            <CardTitle
              id="health-check-title"
              className="flex items-center gap-2 text-base"
            >
              <Activity className="text-muted-foreground h-4 w-4" />
              <span>Health Check</span>
            </CardTitle>
            <CardDescription>
              Configure the HTTP endpoint used for startup and readiness checks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="health.check.path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Path</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="/"
                        className="font-mono text-sm"
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
                  <FormItem className="flex-1">
                    <FormLabel className="text-sm font-medium">Port</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ''}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
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
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <FormField
          control={form.control}
          name="envVariables"
          render={() => {
            const fieldClassName = 'font-mono text-sm m-0';
            return (
              <Card role="group" aria-labelledby="env-vars-title">
                <CardHeader>
                  <CardTitle
                    id="env-vars-title"
                    className="flex items-center gap-2 text-base"
                  >
                    <List className="text-muted-foreground h-4 w-4" />
                    <span>Environment Variables</span>
                  </CardTitle>
                  <CardDescription>
                    Link variables to Auth Client secrets (client-id,
                    client-secret) when you need runtime credentials.
                  </CardDescription>
                  <CardAction>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addEnvVariable}
                      className="h-9"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Environment Variable
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {fields.map((item, index) => {
                      const envVariableLens = lens
                        .focus('envVariables')
                        .focus(index);

                      return (
                        <div
                          key={item.id}
                          className="border-border/60 bg-background flex items-start gap-2 rounded-md border p-2"
                        >
                          <FormField
                            control={form.control}
                            name={`envVariables.${index}.name`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    placeholder="VARIABLE_NAME"
                                    className={cn(
                                      fieldClassName,
                                      'w-[200px] text-blue-700',
                                    )}
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <span className="text-muted-foreground">=</span>
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
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => removeEnvVariable(index)}
                            disabled={fields.length === 1}
                            className="shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          }}
        />

        <VolumeMountsSection
          lens={lens}
          volumeMountFields={volumeMountFields}
          persistentVolumeClaims={persistentVolumeClaims}
          onAdd={addVolumeMount}
          onRemove={removeVolumeMount}
        />

        <Card role="group" aria-labelledby="additional-resources-title">
          <CardHeader>
            <CardTitle
              id="additional-resources-title"
              className="flex items-center gap-2 text-base"
            >
              <Layers className="text-muted-foreground h-4 w-4" />
              <span>Additional Resources</span>
            </CardTitle>
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-[200px] justify-between"
                    data-testid="additional-resource-trigger"
                  >
                    <Plus className="mr-2 h-4 w-4" />
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
            </CardAction>
          </CardHeader>
          <CardContent>
            {additionalResourceFields.length ? (
              <div className="space-y-3">
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
              <div className="text-muted-foreground text-sm">
                No additional resources.
              </div>
            )}
          </CardContent>
        </Card>

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
