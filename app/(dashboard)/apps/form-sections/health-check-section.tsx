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
import { defaultAppData, type AppSchema } from '@/app/api/schemas';
import { useController, useWatch } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';

type HealthCheckSectionProps = {
  healthLens: Lens<AppSchema['health']>;
  ports: AppSchema['ports'];
};

export function HealthCheckSection({
  healthLens,
  ports,
}: HealthCheckSectionProps) {
  const { control, name } = healthLens.interop();
  const { field } = useController({ control, name });
  const health = useWatch({ control, name });
  const isEnabled = Boolean(health);
  const healthCheckLens = healthLens.defined().focus('check');
  const typeInterop = healthCheckLens.focus('type').interop();
  const pathInterop = healthCheckLens.focus('path').interop();
  const portInterop = healthCheckLens.focus('port').interop();
  const handleToggle = (checked: boolean) => {
    if (!checked) {
      field.onChange(undefined);
      return;
    }

    field.onChange(defaultAppData.health);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <InsetSectionTitle id="health-check-title" className="pb-0">
          Health Check
        </InsetSectionTitle>
        <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            aria-label="Enable health check"
          />
        </div>
      </div>
      <InsetGroup role="group" aria-labelledby="health-check-title">
        {isEnabled ? (
          <>
            <div className="bg-muted/50 text-muted-foreground flex items-center gap-4 px-4 py-2 text-xs font-medium">
              <div className="w-8" />
              <span className="w-1/4">Type</span>
              <span className="flex-1">Path</span>
              <span className="w-1/4">Port</span>
            </div>
            <InsetRow>
              <div className="text-muted-foreground flex w-8 items-center justify-center">
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
                            className="hover:bg-muted/50 h-auto w-full border-0 bg-transparent px-2 py-1 shadow-none transition-colors focus:ring-0"
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
                            className="hover:bg-muted/50 flex h-auto w-full gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left shadow-none transition-colors focus:ring-0 [&_[data-slot=select-value]]:line-clamp-none"
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
          </>
        ) : (
          <div className="text-muted-foreground px-4 py-2 text-xs">
            Health checks are disabled.
          </div>
        )}
      </InsetGroup>
    </div>
  );
}
