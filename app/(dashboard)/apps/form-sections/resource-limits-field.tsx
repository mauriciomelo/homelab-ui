'use client';

import { useState } from 'react';
import { useController, useFormState, useWatch } from 'react-hook-form';
import { type Lens } from '@hookform/lenses';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Cpu } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResourceField } from '@/components/resource-field';
import { cpuConfig, memoryConfig } from '@/lib/resource-utils';
import { AppSchema } from '@/app/api/schemas';
import { resourceLimitPreset } from '@/lib/resource-utils';

type SizeKey = 'small' | 'medium' | 'large';

const sizeOptions: ReadonlyArray<SizeKey> = ['small', 'medium', 'large'];

import {
  InsetGroup,
  InsetSectionTitle,
  InsetRow,
  InsetLabel,
} from '@/components/ui/inset-group';

function detectSelectedSize(resources?: {
  limits: { cpu: string; memory: string };
}): SizeKey | 'custom' {
  if (!resources) {
    return 'custom';
  }

  for (const key of sizeOptions) {
    const resource = resourceLimitPreset[key];
    if (
      resource.limits.cpu === resources.limits.cpu &&
      resource.limits.memory === resources.limits.memory
    ) {
      return key;
    }
  }

  return 'custom';
}

function isSizeKey(value: string): value is SizeKey {
  return sizeOptions.some((key) => key === value);
}

export function ResourceLimitsField({
  lens,
}: {
  lens: Lens<AppSchema['resources']>;
}) {
  const { control, name } = lens.interop();
  const resources = useWatch({ control, name });
  const resourcesField = useController({ control, name }).field;
  const [selectedSize, setSelectedSize] = useState<SizeKey | 'custom'>(() =>
    detectSelectedSize(resources),
  );
  const { errors } = useFormState<AppSchema>();
  const cpuInterop = lens.focus('limits').focus('cpu').interop();
  const memoryInterop = lens.focus('limits').focus('memory').interop();

  return (
    <div className="flex flex-col gap-2">
      <InsetSectionTitle id="resource-limits-title">
        Resource Limits
      </InsetSectionTitle>
      <InsetGroup role="group" aria-labelledby="resource-limits-title">
        <InsetRow asChild>
          <FormItem className="space-y-0">
            <InsetLabel asChild>
              <FormLabel>
                <Cpu className="text-muted-foreground h-4 w-4" />
                Preset
              </FormLabel>
            </InsetLabel>
            <div className="flex min-w-0 flex-1 justify-end">
              <Select
                value={selectedSize}
                onValueChange={(value) => {
                  if (value === 'custom' || isSizeKey(value)) {
                    setSelectedSize(value);
                    if (isSizeKey(value)) {
                      resourcesField.onChange(resourceLimitPreset[value]);
                    }
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger className="hover:bg-muted/50 flex h-auto w-full justify-end gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-right shadow-none transition-colors focus:ring-0 [&_[data-slot=select-value]]:line-clamp-none">
                    <SelectValue placeholder="Select resource limits" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {sizeOptions.map((key) => {
                    const { label } = resourceLimitPreset[key];
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2 text-left">
                          <span className="font-bold capitalize">{key}</span>
                          <span className="text-muted-foreground text-xs">
                            {label}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                  <SelectItem value="custom">
                    <div className="flex items-center gap-2 text-left">
                      <span className="font-bold">Custom</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FormItem>
        </InsetRow>

        {selectedSize === 'custom' && (
          <>
            <FormField
              control={cpuInterop.control}
              name={cpuInterop.name}
              render={({ field }) => (
                <InsetRow asChild>
                  <FormItem className="space-y-0">
                    <InsetLabel asChild>
                      <FormLabel>CPU</FormLabel>
                    </InsetLabel>
                    <div className="min-w-0 flex-1">
                      <ResourceField
                        id="resource-limits-cpu"
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.resources?.limits?.cpu?.message}
                        dataTestId="resource-limits-cpu-input"
                        config={cpuConfig}
                      />
                    </div>
                  </FormItem>
                </InsetRow>
              )}
            />
            <FormField
              control={memoryInterop.control}
              name={memoryInterop.name}
              render={({ field }) => (
                <InsetRow asChild>
                  <FormItem className="space-y-0">
                    <InsetLabel asChild>
                      <FormLabel>Memory</FormLabel>
                    </InsetLabel>
                    <div className="min-w-0 flex-1">
                      <ResourceField
                        id="resource-limits-memory"
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.resources?.limits?.memory?.message}
                        dataTestId="resource-limits-memory-input"
                        config={memoryConfig}
                      />
                    </div>
                  </FormItem>
                </InsetRow>
              )}
            />
          </>
        )}
      </InsetGroup>
    </div>
  );
}
