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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { HardDrive, Plus, Trash2 } from 'lucide-react';
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
        <Card role="group" aria-labelledby="volume-mounts-title">
          <CardHeader>
            <CardTitle
              id="volume-mounts-title"
              className="flex items-center gap-2 text-base"
            >
              <HardDrive className="text-muted-foreground h-4 w-4" />
              <span>Volume Mounts</span>
            </CardTitle>
            <CardDescription>
              Mount persistent volumes inside the container.
            </CardDescription>
            <CardAction>
              <Button
                type="button"
                variant="outline"
                onClick={onAdd}
                className="h-9"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Volume Mount
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {volumeMountFields.length ? (
              <>
                <div className="text-muted-foreground flex items-center gap-2 px-2 text-xs font-semibold">
                  <span className="w-60">Mount Path</span>
                  <span className="flex-1">Persistent Volume</span>
                  <div className="w-9" />
                </div>
                <div className="space-y-3">
                  {volumeMountFields.map((item, index) => {
                    const mountLens = volumeMountsLens.focus(index).defined();
                    const mountPathInterop = mountLens
                      .focus('mountPath')
                      .interop();
                    const volumeNameInterop = mountLens.focus('name').interop();

                    return (
                      <div
                        key={item.id}
                        className="border-border/60 bg-background flex items-start gap-2 rounded-md border p-2"
                      >
                        <FormField
                          control={mountPathInterop.control}
                          name={mountPathInterop.name}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  placeholder="/data"
                                  className={cn(fieldClassName, 'w-60')}
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
                            <FormItem className="flex-1 grow">
                              <Select
                                onValueChange={field.onChange}
                                value={field.value ?? ''}
                              >
                                <FormControl>
                                  <SelectTrigger
                                    aria-label="Persistent Volume"
                                    className="w-full"
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
                          variant="secondary"
                          size="icon"
                          onClick={() => onRemove(index)}
                          className="shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                No volume mounts.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    />
  );
}
