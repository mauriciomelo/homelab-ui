'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
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
  Layers,
  List,
  Loader2Icon,
  Globe,
  Package,
  Plug,
  Plus,
  Rocket,
  Trash2,
} from 'lucide-react';
import type { App } from '@/app/api/applications';
import { AppSchema, appSchema } from '@/app/api/schemas';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createApp } from './actions';
import { AuthClientCard } from './auth-client-card';
import { ResourceLimitsField, sizeToResource } from './resource-limits-field';

type FormMode = 'edit' | 'create';

const defaultAppData: AppSchema = {
  name: '',
  image: '',
  ports: [{ name: 'http', containerPort: 80 }],
  envVariables: [{ name: '', value: '' }],
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
    defaultValues: props.data ?? defaultAppData,
  });

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

  const ports = useWatch({ control: form.control, name: 'ports' });
  const additionalResources =
    useWatch({ control: form.control, name: 'additionalResources' }) ?? [];

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

        <ResourceLimitsField control={form.control} />

        <Separator className="my-2" />

        <FormField
          control={form.control}
          name="ports"
          render={() => {
            const fieldClassName = 'font-mono text-sm m-0';
            return (
              <div className="border-border/60 bg-muted/20 space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <Plug className="text-muted-foreground h-4 w-4" />
                    <span>Ports</span>
                  </div>
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
                </div>
                <div className="text-muted-foreground flex items-center gap-2 px-2 text-xs font-semibold">
                  <span className="w-60">Port Name</span>
                  <span className="flex-1">Port Number</span>
                  <div className="w-9" />
                </div>
                <div className="space-y-3">
                  {portFields.map((item, index) => (
                    <div
                      key={item.id}
                      className="border-border/60 bg-background flex items-center gap-2 rounded-md border p-2"
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
              </div>
            );
          }}
        />

        <FormField
          control={form.control}
          name="envVariables"
          render={() => {
            const fieldClassName = 'font-mono text-sm m-0';
            return (
              <div className="border-border/60 bg-muted/20 space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <List className="text-muted-foreground h-4 w-4" />
                    <span>Environment Variables</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addEnvVariable}
                    className="h-9"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Environment Variable
                  </Button>
                </div>
                <div className="space-y-3">
                  {fields.map((item, index) => (
                    <div
                      key={item.id}
                      className="border-border/60 bg-background flex items-center gap-2 rounded-md border p-2"
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
                      <FormField
                        control={form.control}
                        name={`envVariables.${index}.value`}
                        render={({ field }) => (
                          <FormItem className="flex-1 grow">
                            <FormControl>
                              <Input
                                placeholder="value"
                                className={cn(fieldClassName)}
                                type="text"
                                {...field}
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
                        onClick={() => removeEnvVariable(index)}
                        disabled={fields.length === 1}
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        />

        <div className="border-border/60 bg-muted/20 space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Layers className="text-muted-foreground h-4 w-4" />
              <span>Additional Resources</span>
            </div>
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
                  Auth Client
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {additionalResourceFields.length ? (
            <div className="space-y-3">
              {additionalResourceFields.map((resourceField, index) => {
                const resource = additionalResources[index];
                if (!resource || resource.kind !== 'AuthClient') {
                  return null;
                }

                return (
                  <AuthClientCard
                    key={resourceField.id}
                    control={form.control}
                    index={index}
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
