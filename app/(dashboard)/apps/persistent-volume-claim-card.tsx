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
import { Input } from '@/components/ui/input';
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
    <div className="border-border/70 bg-background space-y-4 rounded-lg border p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="text-muted-foreground h-4 w-4" />
            <span>Persistent Volume</span>
          </div>
          <p className="text-muted-foreground text-xs">
            Define persistent storage for your app.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove Persistent Volume"
          onClick={() => onRemove(index)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <FormField
        control={nameInterop.control}
        name={nameInterop.name}
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel>Persistent Volume Name</FormLabel>
            <FormControl>
              <Input className="font-mono text-sm" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={storageInterop.control}
        name={storageInterop.name}
        render={({ field }) => (
          <FormItem>
            <ResourceField
              id={`pvc-storage-${index}`}
              label="Storage"
              value={field.value}
              onChange={field.onChange}
              error={storageError}
              config={storageConfig}
            />
          </FormItem>
        )}
      />
      <FormField
        control={accessModesInterop.control}
        name={accessModesInterop.name}
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel>Access Mode</FormLabel>
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
                <ComboboxInput placeholder="Search access modes..." />
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
          </FormItem>
        )}
      />
    </div>
  );
}
