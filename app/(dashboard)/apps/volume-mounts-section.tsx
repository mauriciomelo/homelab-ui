'use client';

import type { FieldArrayWithId } from 'react-hook-form';
import type { Lens } from '@hookform/lenses';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AppSchema, PersistentVolumeClaimSchema } from '@/app/api/schemas';

type VolumeMountsSectionProps = {
  lens: Lens<AppSchema>;
  volumeMountFields: FieldArrayWithId<AppSchema, 'volumeMounts', 'id'>[];
  persistentVolumeClaims: PersistentVolumeClaimSchema[];
  onAdd: () => void;
  onRemove: (index: number) => void;
};

import {
  InsetGroup,
  InsetSectionTitle,
  InsetRow,
  InsetInput,
} from '@/components/ui/inset-group';

export function VolumeMountsSection({
  lens,
  volumeMountFields,
  persistentVolumeClaims,
  onAdd,
  onRemove,
}: VolumeMountsSectionProps) {
  const fieldClassName = 'font-mono text-sm m-0';
  const hasPersistentVolumeClaims = persistentVolumeClaims.length > 0;
  const volumeMountsLens = lens.focus('volumeMounts').defined();
  const volumeMountsInterop = volumeMountsLens.interop();

  return (
    <FormField
      control={volumeMountsInterop.control}
      name={volumeMountsInterop.name}
      render={() => (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <InsetSectionTitle id="volume-mounts-title" className="pb-0">
              Volume Mounts
            </InsetSectionTitle>
            <Button
              type="button"
              variant="ghost"
              onClick={onAdd}
              className="h-6 px-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Volume Mount
            </Button>
          </div>
          <InsetGroup role="group" aria-labelledby="volume-mounts-title">
            {volumeMountFields.length > 0 && (
              <div className="flex items-center gap-4 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span className="w-1/3">Mount Path</span>
                <span className="flex-1">Persistent Volume</span>
                <div className="w-8" />
              </div>
            )}
            {volumeMountFields.length > 0 ? (
              volumeMountFields.map((item, index) => {
                const mountLens = volumeMountsLens.focus(index).defined();
                const mountPathInterop = mountLens
                  .focus('mountPath')
                  .interop();
                const volumeNameInterop = mountLens
                  .focus('name')
                  .interop();

                return (
                  <InsetRow key={item.id}>
                    <FormField
                      control={mountPathInterop.control}
                      name={mountPathInterop.name}
                      render={({ field }) => (
                        <FormItem className="w-1/3 space-y-0">
                          <FormControl>
                            <InsetInput
                              placeholder="/data"
                              className={cn(fieldClassName, 'text-left')}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={volumeNameInterop.control}
                      name={volumeNameInterop.name}
                      render={({ field }) => (
                        <FormItem className="flex-1 space-y-0">
                          <Select
                            onValueChange={field.onChange}
                            value={field.value ?? ''}
                          >
                            <FormControl>
                              <SelectTrigger
                                aria-label="Persistent Volume"
                                className="h-auto py-1 w-full border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 shadow-none focus:ring-0 text-left"
                              >
                                <SelectValue placeholder="Select a persistent volume">
                                  {field.value ? (
                                    <span className="font-mono">
                                      {field.value}
                                    </span>
                                  ) : null}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {hasPersistentVolumeClaims ? (
                                persistentVolumeClaims.map((resource) => (
                                  <SelectItem
                                    key={resource.metadata.name}
                                    value={resource.metadata.name}
                                  >
                                    <span className="font-mono">
                                      {resource.metadata.name}
                                    </span>
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="no-pv" disabled>
                                  Add a persistent volume in Additional
                                  Resources
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(index)}
                      className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </InsetRow>
                );
              })
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No volume mounts configured.
              </div>
            )}
          </InsetGroup>
        </div>
      )}
    />
  );
}
