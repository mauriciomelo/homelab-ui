'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLens } from '@hookform/lenses';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Loader2Icon, Plus, Rocket, Shield, HardDrive } from 'lucide-react';
import type { App } from '@/app/api/applications';
import {
  AppSchema,
  appSchema,
  type PersistentVolumeClaimSchema,
} from '@/app/api/schemas';
import { updateApp } from './actions';
import { Separator } from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InsetGroup, InsetSectionTitle } from '@/components/ui/inset-group';
import { createApp } from './actions';
import { AuthClientCard } from './auth-client-card';
import {
  ResourceLimitsField,
  sizeToResource,
} from './form-sections/resource-limits-field';
import { PersistentVolumeClaimCard } from './persistent-volume-claim-card';
import { VolumeMountsSection } from './form-sections/volume-mounts-section';
import { AppBasicsSection } from './form-sections/app-basics-section';
import { PortsSection } from './form-sections/ports-section';
import { HealthCheckSection } from './form-sections/health-check-section';
import { EnvironmentVariablesSection } from './form-sections/environment-variables-section';

type FormMode = 'edit' | 'create';

const basePersistentVolumeName = 'data';

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

  const additionalResources =
    useWatch({ control: form.control, name: 'additionalResources' }) ?? [];
  const ports = useWatch({ control: form.control, name: 'ports' });
  const persistentVolumeClaims = additionalResources.filter(
    (resource): resource is PersistentVolumeClaimSchema =>
      resource.kind === 'PersistentVolumeClaim',
  );

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
        <AppBasicsSection lens={lens} mode={mode} />

        <ResourceLimitsField lens={lens.focus('resources')} />

        <Separator className="my-2" />

        <PortsSection
          portsLens={lens.focus('ports')}
          ingressLens={lens.focus('ingress')}
          fields={portFields}
          onAdd={addPort}
          onRemove={handleRemovePort}
          setValue={form.setValue}
        />

        <HealthCheckSection healthLens={lens.focus('health')} ports={ports} />

        <EnvironmentVariablesSection
          envVariablesLens={lens.focus('envVariables')}
          additionalResourcesLens={lens.focus('additionalResources')}
          fields={fields}
          onAdd={addEnvVariable}
          onRemove={removeEnvVariable}
        />

        <VolumeMountsSection
          volumeMountsLens={lens.focus('volumeMounts')}
          volumeMountFields={volumeMountFields}
          persistentVolumeClaims={persistentVolumeClaims}
          onAdd={addVolumeMount}
          onRemove={removeVolumeMount}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <InsetSectionTitle id="additional-resources-title" className="pb-0">
              Additional Resources
            </InsetSectionTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 px-2 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
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
              <div className="text-muted-foreground p-8 text-center text-sm">
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
