'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
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
import { Loader2Icon, Plus, Rocket, Trash2 } from 'lucide-react';
import type { App } from '@/app/api/applications';
import { appFormSchema } from './formSchema';
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
import { useState } from 'react';
import { ResourceField } from '@/components/resource-field';
import { createApp } from './actions';

export const sizeToResource = {
  small: {
    limits: { cpu: '500m', memory: '512Mi' },
    label: '0.5 vCPU, 512Mi RAM',
  },
  medium: { limits: { cpu: '1', memory: '1Gi' }, label: '1 vCPU, 1Gi RAM' },
  large: { limits: { cpu: '2', memory: '2Gi' }, label: '2 vCPU, 2Gi RAM' },
} as const;

type SizeKey = keyof typeof sizeToResource;

function detectSelectedSize(resources: {
  limits: { cpu: string; memory: string };
}): SizeKey | 'custom' {
  const predefinedSize = Object.entries(sizeToResource).find(
    ([, res]) =>
      res.limits.cpu === resources.limits.cpu &&
      res.limits.memory === resources.limits.memory,
  );

  return predefinedSize ? (predefinedSize[0] as SizeKey) : 'custom';
}

type FormData = z.infer<typeof appFormSchema>;
type FormMode = 'edit' | 'create';

const defaultAppData: FormData = {
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

  const form = useForm<FormData>({
    resolver: zodResolver(appFormSchema),
    defaultValues: props.data ?? defaultAppData,
  });

  const [selectedSize, setSelectedSize] = useState<string>(() => {
    const resource = form.getValues('resources');
    return detectSelectedSize(resource);
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'envVariables',
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

  const handleRemovePort = (index: number) => {
    if (portFields.length > 1) {
      removePort(index);
    }
  };

  return (
    <Form {...form}>
      <form
        className={cn('space-y-4', props.className)}
        onSubmit={form.handleSubmit(async (data) => {
          const result =
            mode === 'create' ? await createApp(data) : await updateApp(data);
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

        <FormField
          control={form.control}
          name="resources"
          render={() => (
            <FormItem>
              <FormLabel className="flex items-center gap-2 text-base font-medium">
                Resource Limits
              </FormLabel>
              <div className="flex gap-2">
                <Select
                  value={selectedSize}
                  onValueChange={(value) => {
                    setSelectedSize(value);
                    if (value !== 'custom') {
                      form.setValue(
                        'resources',
                        sizeToResource[value as keyof typeof sizeToResource],
                      );
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="h-auto shrink-0 [&_[data-slot=select-value]]:line-clamp-none">
                      <SelectValue placeholder="Select resource limits" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(sizeToResource).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2 text-left">
                          <span className="font-bold capitalize">{key}</span>
                          <span className="text-muted-foreground text-xs">
                            {label}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">
                      <div className="flex items-center gap-2 text-left">
                        <span className="font-bold">Custom</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {selectedSize === 'custom' && (
                  <>
                    <div className="flex-1">
                      <FormField
                        control={form.control}
                        name="resources.limits.cpu"
                        render={({ field }) => (
                          <FormItem>
                            <ResourceField
                              id="resource-limits-cpu"
                              value={field.value}
                              onChange={field.onChange}
                              error={
                                form.formState.errors.resources?.limits?.cpu
                                  ?.message
                              }
                              dataTestId="resource-limits-cpu-input"
                              type="cpu"
                            />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <FormField
                        control={form.control}
                        name="resources.limits.memory"
                        render={({ field }) => (
                          <FormItem>
                            <ResourceField
                              id="resource-limits-memory"
                              value={field.value}
                              onChange={field.onChange}
                              error={
                                form.formState.errors.resources?.limits?.memory
                                  ?.message
                              }
                              dataTestId="resource-limits-memory-input"
                            />
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}
              </div>
              <FormDescription>
                Choose the resource allocation for your app.
              </FormDescription>
            </FormItem>
          )}
        />

        <Separator />

        <div className="text-base font-medium">Ports</div>

        <FormField
          control={form.control}
          name="ports"
          render={() => {
            const fieldClassName = 'font-mono text-sm m-0';
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2">
                  <span className="w-60 text-xs font-medium text-gray-500">
                    Port Name
                  </span>
                  <span className="flex-1 text-xs font-medium text-gray-500">
                    Port Number
                  </span>
                  <div className="w-9" />
                </div>
                {portFields.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 rounded-md border border-gray-200 p-2"
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={addPort}
                  className="w-full"
                  data-testid="add-port-btn"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Port
                </Button>
              </div>
            );
          }}
        />

        <FormField
          control={form.control}
          name="ingress.port.name"
          render={({ field }) => {
            return (
              <FormItem>
                <FormLabel className="flex items-center gap-2 text-base font-medium">
                  Ingress Port
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
                  The port name referenced by the Ingress
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="text-base font-medium">Environment Variables</div>

        <FormField
          control={form.control}
          name="envVariables"
          render={() => {
            const fieldClassName = 'font-mono text-sm m-0';
            return (
              <div className="space-y-2">
                {fields.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-md border border-gray-200 p-2"
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
                    <span className="text-gray-400">=</span>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={addEnvVariable}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Environment Variable
                </Button>
              </div>
            );
          }}
        />

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
