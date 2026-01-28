'use client';

import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import {
  InsetGroup,
  InsetInput,
  InsetRow,
  InsetSectionTitle,
} from '@/components/ui/inset-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Lens } from '@hookform/lenses';
import { Activity } from 'lucide-react';
import type { AppSchema } from '@/app/api/schemas';

type HealthCheckSectionProps = {
  healthLens: Lens<AppSchema['health']>;
  ports: AppSchema['ports'];
};

export function HealthCheckSection({ healthLens, ports }: HealthCheckSectionProps) {
  const healthCheckLens = healthLens.defined().focus('check');
  const typeInterop = healthCheckLens.focus('type').interop();
  const pathInterop = healthCheckLens.focus('path').interop();
  const portInterop = healthCheckLens.focus('port').interop();

  return (
    <div className="flex flex-col gap-2">
      <InsetSectionTitle id="health-check-title">Health Check</InsetSectionTitle>
      <InsetGroup role="group" aria-labelledby="health-check-title">
        <div className="flex items-center gap-4 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <div className="w-8" />
          <span className="w-1/4">Type</span>
          <span className="flex-1">Path</span>
          <span className="w-1/4">Port</span>
        </div>
        <InsetRow>
          <div className="flex w-8 items-center justify-center text-muted-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <FormField
            control={typeInterop.control}
            name={typeInterop.name}
            render={({ field }) => (
              <FormItem className="w-1/4 space-y-0">
                <div className="flex-1 space-y-0">
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? 'httpGet'}
                  >
                    <FormControl>
                      <SelectTrigger
                        aria-label="Type"
                        className="h-auto w-full border-0 bg-transparent px-2 py-1 shadow-none transition-colors hover:bg-muted/50 focus:ring-0"
                      >
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="httpGet">GET</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
          <FormField
            control={pathInterop.control}
            name={pathInterop.name}
            render={({ field }) => (
              <FormItem className="flex-1 space-y-0">
                <FormControl>
                  <InsetInput
                    placeholder="/"
                    aria-label="Path"
                    className="text-left"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={portInterop.control}
            name={portInterop.name}
            render={({ field }) => (
              <FormItem className="w-1/4 space-y-0">
                <div className="flex-1 space-y-0">
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
                  >
                    <FormControl>
                      <SelectTrigger
                        aria-label="Port"
                        className="h-auto py-1 w-full border-0 bg-transparent px-2 rounded-md transition-colors hover:bg-muted/50 shadow-none focus:ring-0 flex gap-2 text-left [&_[data-slot=select-value]]:line-clamp-none"
                      >
                        <SelectValue placeholder="Select a port" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ports?.map(
                        (port, index) =>
                          port.name && (
                            <SelectItem key={index} value={port.name}>
                              <span className="font-mono">
                                {port.name} ({port.containerPort})
                              </span>
                            </SelectItem>
                          ),
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        </InsetRow>
      </InsetGroup>
    </div>
  );
}
