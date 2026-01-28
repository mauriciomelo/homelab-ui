'use client';

import { useController } from 'react-hook-form';
import { type Lens } from '@hookform/lenses';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { ResourceField } from '@/components/resource-field';
import { storageConfig } from '@/lib/resource-utils';
import { HardDrive, Trash2 } from 'lucide-react';
import { PersistentVolumeClaimSchema } from '@/app/api/schemas';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';

import {
  InsetGroup,
  InsetRow,
  InsetLabel,
  InsetInput,
} from '@/components/ui/inset-group';

const accessModeOptions = [
  {
    value: 'ReadWriteOnce',
    label: 'ReadWriteOnce',
    description: 'Mounted as read-write by a single node.',
  },
  {
    value: 'ReadOnlyMany',
    label: 'ReadOnlyMany',
    description: 'Mounted read-only by many nodes.',
  },
  {
    value: 'ReadWriteMany',
    label: 'ReadWriteMany',
    description: 'Mounted read-write by many nodes.',
  },
];

export function PersistentVolumeClaimCard({
  lens,
  index,
  onRemove,
}: {
  lens: Lens<PersistentVolumeClaimSchema>;
  index: number;
  onRemove: (index: number) => void;
}) {
  const nameInterop = lens.focus('metadata').focus('name').interop();
  const accessModesInterop = lens.focus('spec').focus('accessModes').interop();
  const storageInterop = lens
    .focus('spec')
    .focus('resources')
    .focus('requests')
    .focus('storage')
    .interop();
  const storageError = useController(storageInterop).fieldState.error?.message;

  return (
    <InsetGroup
      role="group"
      aria-labelledby={`persistent-volume-title-${index}`}
    >
      <div className="flex items-center justify-between p-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <HardDrive className="text-muted-foreground h-4 w-4" />
          <span
            id={`persistent-volume-title-${index}`}
            className="text-sm font-medium"
          >
            Persistent Volume
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove Persistent Volume"
          onClick={() => onRemove(index)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <FormField
        control={nameInterop.control}
        name={nameInterop.name}
        render={({ field }) => (
          <InsetRow asChild>
            <FormItem className="space-y-0">
              <InsetLabel asChild>
                <FormLabel>Name</FormLabel>
              </InsetLabel>
              <FormControl>
                <InsetInput className="text-left" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          </InsetRow>
        )}
      />
      <FormField
        control={storageInterop.control}
        name={storageInterop.name}
        render={({ field }) => (
          <InsetRow asChild>
            <FormItem className="space-y-0">
              <InsetLabel asChild>
                <Label htmlFor={`pvc-storage-${index}`}>Storage</Label>
              </InsetLabel>
              <div className="flex-1 min-w-0">
                <ResourceField
                  id={`pvc-storage-${index}`}
                  value={field.value}
                  onChange={field.onChange}
                  error={storageError}
                  config={storageConfig}
                />
              </div>
            </FormItem>
          </InsetRow>
        )}
      />
      <FormField
        control={accessModesInterop.control}
        name={accessModesInterop.name}
        render={({ field }) => (
          <InsetRow asChild>
            <FormItem className="space-y-0">
              <InsetLabel asChild>
                <FormLabel>Access Mode</FormLabel>
              </InsetLabel>
              <div className="flex-1 min-w-0">
                <Combobox
                  items={accessModeOptions}
                  value={
                    accessModeOptions.find(
                      (option) => option.value === field.value?.[0],
                    ) ?? null
                  }
                  onValueChange={(value) =>
                    field.onChange(value ? [value.value] : [])
                  }
                  itemToStringLabel={(option) => option.label}
                  itemToStringValue={(option) => option.value}
                >
                  <FormControl>
                    <ComboboxInput
                      placeholder="Search access modes..."
                      className="h-auto py-1 w-full border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 shadow-none focus:ring-0 text-left"
                    />
                  </FormControl>
                  <ComboboxContent>
                    <ComboboxEmpty>No access modes found.</ComboboxEmpty>
                    <ComboboxList>
                      {(option) => (
                        <ComboboxItem key={option.value} value={option}>
                          <div className="flex flex-col text-left">
                            <span>{option.label}</span>
                            <span className="text-muted-foreground text-xs">
                              {option.description}
                            </span>
                          </div>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <FormMessage />
              </div>
            </FormItem>
          </InsetRow>
        )}
      />
    </InsetGroup>
  );
}
