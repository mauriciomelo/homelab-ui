'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLens } from '@hookform/lenses';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Shield, HardDrive } from 'lucide-react';
import type { App } from '@/app/api/applications';
import isEqual from 'lodash/isEqual';
import {
  AppSchema,
  appSchema,
  defaultAppData,
  type PersistentVolumeClaimSchema,
} from '@/app/api/schemas';
import { controlPlaneOrpc } from '@/control-plane-orpc/client';
import { Separator } from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InsetGroup, InsetSectionTitle } from '@/components/ui/inset-group';
import { AuthClientCard } from './auth-client-card';
import { ResourceLimitsField } from './form-sections/resource-limits-field';
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

export function useApplicationForm({
  data,
  mode,
}: {
  data?: App['spec'];
  mode: FormMode;
}) {
  const form = useForm<AppSchema>({
    resolver: zodResolver(appSchema),
    defaultValues: data ?? defaultAppData,
  });

  const createAppMutation = useMutation(
    controlPlaneOrpc.apps.create.mutationOptions(),
  );
  const updateAppMutation = useMutation(
    controlPlaneOrpc.apps.update.mutationOptions(),
  );

  const onSubmit = form.handleSubmit(async (formData) => {
    const result =
      mode === 'create'
        ? await createAppMutation.mutateAsync(formData)
        : await updateAppMutation.mutateAsync(formData);
    // TODO: remove log and handle success/failure
    console.log(result);
  });

  return { form, data, mode, onSubmit };
}

export function ApplicationForm(
  props: {
    className?: string;
  } & ReturnType<typeof useApplicationForm>,
) {
  const { form, mode } = props;

  const lens = useLens({ control: form.control });
  const additionalResourcesLens = lens.focus('additionalResources').defined();

  const [lastSeenData, setLastSeenData] = useState(props.data);

  const hasDataChanged = useMemo(
    () => !isEqual(lastSeenData, props.data),
    [lastSeenData, props.data],
  );

  const handleExternalUpdateConfirm = () => {
    const newData = props.data;
    setLastSeenData(newData);
    form.reset(newData);
  };

  const handleExternalUpdateCancel = () => {
    const newData = props.data;
    setLastSeenData(newData);
  };

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
    remove(index);
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
    <div className={cn('space-y-8', props.className)}>
      <AlertDialog
        open={hasDataChanged}
        onOpenChange={(open) => {
          if (!open) {
            handleExternalUpdateCancel();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>External update detected</AlertDialogTitle>
            <AlertDialogDescription>
              This app was updated elsewhere. Do you want to load the latest
              values? Unsaved changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleExternalUpdateCancel}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExternalUpdateConfirm}>
              Load new values
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    </div>
  );
}
