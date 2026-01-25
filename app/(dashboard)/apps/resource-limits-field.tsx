'use client';

import { useState } from 'react';
import { useController, useFormState, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
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
import { AppSchema } from '@/app/api/schemas';

type SizeKey = 'small' | 'medium' | 'large';

const sizeOptions: ReadonlyArray<SizeKey> = ['small', 'medium', 'large'];

export const sizeToResource = {
  small: {
    limits: { cpu: '500m', memory: '512Mi' },
    label: '0.5 vCPU, 512Mi RAM',
  },
  medium: { limits: { cpu: '1', memory: '1Gi' }, label: '1 vCPU, 1Gi RAM' },
  large: { limits: { cpu: '2', memory: '2Gi' }, label: '2 vCPU, 2Gi RAM' },
} satisfies Record<
  SizeKey,
  {
    limits: { cpu: string; memory: string };
    label: string;
  }
>;

function detectSelectedSize(resources?: {
  limits: { cpu: string; memory: string };
}): SizeKey | 'custom' {
  if (!resources) {
    return 'custom';
  }

  for (const key of sizeOptions) {
    const resource = sizeToResource[key];
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
  control,
}: {
  control: Control<AppSchema>;
}) {
  const resources = useWatch({ control, name: 'resources' });
  const resourcesField = useController({ control, name: 'resources' }).field;
  const [selectedSize, setSelectedSize] = useState<SizeKey | 'custom'>(() =>
    detectSelectedSize(resources),
  );
  const { errors } = useFormState({ control });

  return (
    <FormItem>
      <FormLabel className="flex items-center gap-2 text-base font-medium">
        <Cpu className="text-muted-foreground h-4 w-4" />
        Resource Limits
      </FormLabel>
      <div className="flex gap-2">
        <Select
          value={selectedSize}
          onValueChange={(value) => {
            if (value === 'custom' || isSizeKey(value)) {
              setSelectedSize(value);
              if (isSizeKey(value)) {
                resourcesField.onChange(sizeToResource[value]);
              }
            }
          }}
        >
          <FormControl>
            <SelectTrigger className="h-auto shrink-0 [&_[data-slot=select-value]]:line-clamp-none">
              <SelectValue placeholder="Select resource limits" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {sizeOptions.map((key) => {
              const { label } = sizeToResource[key];
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
        {selectedSize === 'custom' && (
          <>
            <div className="flex-1">
              <FormField
                control={control}
                name="resources.limits.cpu"
                render={({ field }) => (
                  <FormItem>
                    <ResourceField
                      id="resource-limits-cpu"
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.resources?.limits?.cpu?.message}
                      dataTestId="resource-limits-cpu-input"
                      type="cpu"
                    />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex-1">
              <FormField
                control={control}
                name="resources.limits.memory"
                render={({ field }) => (
                  <FormItem>
                    <ResourceField
                      id="resource-limits-memory"
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.resources?.limits?.memory?.message}
                      dataTestId="resource-limits-memory-input"
                      type="memory"
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
  );
}
