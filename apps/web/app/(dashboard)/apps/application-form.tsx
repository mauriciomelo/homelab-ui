'use client';

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useLens } from '@hookform/lenses';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Shield, HardDrive } from 'lucide-react';
import isEqual from 'lodash/isEqual';
import {
  AppBundleSchema,
  appBundleSchema,
  defaultAppBundleData,
  type PersistentVolumeClaimSchema,
} from '@/app/api/schemas';
import { appOrpc } from '@/app-orpc/client';
import { Separator } from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  onPublishSuccess,
  defaultValues,
}: {
  data?: AppBundleSchema;
  mode: FormMode;
  onPublishSuccess?: () => Promise<void> | void;
  defaultValues?: AppBundleSchema | (() => Promise<AppBundleSchema>);
}) {
  const form = useForm<AppBundleSchema>({
    resolver: standardSchemaResolver(appBundleSchema),
    defaultValues: defaultValues ?? data ?? defaultAppBundleData,
  });

  const publishAppMutation = useMutation(
    appOrpc.apps.publish.mutationOptions(),
  );

  const onSubmit = form.handleSubmit(async (formData) => {
    await publishAppMutation.mutateAsync(formData);
    await onPublishSuccess?.();
  });

  return { form, data, mode, onSubmit };
}

export function ApplicationForm(
  props: {
    className?: string;
  } & ReturnType<typeof useApplicationForm>,
) {
  const { form, mode } = props;
  const previousDataRef = useRef(props.data);

  const lens = useLens({ control: form.control });
  const appLens = lens.focus('app');
  const appSpecLens = appLens.focus('spec');
  const additionalResourcesLens = lens.focus('additionalResources').defined();

  useEffect(() => {
    if (isEqual(previousDataRef.current, props.data)) {
      return;
    }

    form.reset(props.data);
    previousDataRef.current = props.data;
  }, [form, props.data]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'app.spec.envVariables',
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
    name: 'app.spec.ports',
  });

  const {
    fields: volumeMountFields,
    append: appendVolumeMount,
    remove: removeVolumeMount,
  } = useFieldArray({
    control: form.control,
    name: 'app.spec.volumeMounts',
  });

  const additionalResources =
    useWatch({ control: form.control, name: 'additionalResources' }) ?? [];
  const ports = useWatch({ control: form.control, name: 'app.spec.ports' });
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
    const newAuthClient: NonNullable<
      AppBundleSchema['additionalResources']
    >[number] = {
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
      AppBundleSchema['additionalResources']
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
      <AppBasicsSection lens={appLens} mode={mode} />

      <ResourceLimitsField lens={appSpecLens.focus('resources')} />

      <Separator className="my-2" />

      <PortsSection
        portsLens={appSpecLens.focus('ports')}
        ingressLens={appSpecLens.focus('ingress')}
        fields={portFields}
        onAdd={addPort}
        onRemove={handleRemovePort}
        setValue={form.setValue}
      />

      <HealthCheckSection
        healthLens={appSpecLens.focus('health')}
        ports={ports}
      />

      <EnvironmentVariablesSection
        envVariablesLens={appSpecLens.focus('envVariables')}
         additionalResourcesLens={lens.focus('additionalResources')}
        fields={fields}
        onAdd={addEnvVariable}
        onRemove={removeEnvVariable}
      />

      <VolumeMountsSection
        volumeMountsLens={appSpecLens.focus('volumeMounts')}
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
