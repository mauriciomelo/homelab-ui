'use client';

import { Button } from '@/components/ui/button';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Lens } from '@hookform/lenses';
import { Globe, Plus, Trash2 } from 'lucide-react';
import type { FieldArrayWithId, UseFormSetValue } from 'react-hook-form';
import type { AppSchema } from '@/app/api/schemas';
import { useWatch } from 'react-hook-form';

type PortsSectionProps = {
  portsLens: Lens<AppSchema['ports']>;
  ingressLens: Lens<AppSchema['ingress']>;
  fields: FieldArrayWithId<AppSchema, 'ports', 'id'>[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  setValue: UseFormSetValue<AppSchema>;
};

export function PortsSection({
  portsLens,
  ingressLens,
  fields,
  onAdd,
  onRemove,
  setValue,
}: PortsSectionProps) {
  const { control: portsControl, name: portsName } = portsLens.interop();
  const { control: ingressControl, name: ingressName } = ingressLens.interop();

  const ports = useWatch({ control: portsControl, name: portsName });
  const ingress = useWatch({ control: ingressControl, name: ingressName });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <InsetSectionTitle id="ports-title" className="pb-0">
          Ports
        </InsetSectionTitle>
        <Button
          type="button"
          variant="ghost"
          onClick={onAdd}
          className="h-6 px-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          aria-label="Add Port"
          data-testid="add-port-btn"
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Port
        </Button>
      </div>
      <InsetGroup role="group" aria-labelledby="ports-title">
        <div className="flex items-center gap-4 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span className="w-1/3">Port Name</span>
          <span className="flex-1">Port Number</span>
          <div className="w-[72px]" />
        </div>
        {fields.map((item, index) => {
          const portLens = portsLens.focus(index).defined();
          const nameInterop = portLens.focus('name').interop();
          const containerPortInterop = portLens.focus('containerPort').interop();

          const currentPortName = ports?.[index]?.name;
          const isWebPort = ingress?.port?.name === currentPortName;

          return (
            <InsetRow key={item.id}>
              <FormField
                control={nameInterop.control}
                name={nameInterop.name}
                render={({ field }) => (
                  <FormItem className="w-1/3 space-y-0">
                    <FormControl>
                      <InsetInput
                        placeholder="http"
                        aria-label="Port Name"
                        data-testid={`port-name-${index}`}
                        className="text-left"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={containerPortInterop.control}
                name={containerPortInterop.name}
                render={({ field }) => (
                  <FormItem className="flex-1 space-y-0">
                    <FormControl>
                      <InsetInput
                        placeholder="80"
                        aria-label="Port Number"
                        data-testid={`port-number-${index}`}
                        type="number"
                        className="text-left"
                        {...field}
                        onChange={(event) =>
                          field.onChange(+event.target.value)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (currentPortName) {
                          setValue('ingress.port.name', currentPortName);
                        }
                      }}
                      className={cn(
                        'h-8 w-8 transition-colors',
                        isWebPort
                          ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      aria-pressed={isWebPort}
                      aria-label={
                        isWebPort ? 'Web Port (Active)' : 'Set as Web Port'
                      }
                      data-testid={`web-port-toggle-${index}`}
                    >
                      <Globe className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isWebPort ? 'Web Port (Active)' : 'Set as Web Port'}
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(index)}
                  disabled={fields.length === 1}
                  className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove Port"
                  data-testid={`remove-port-${index}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </InsetRow>
          );
        })}
      </InsetGroup>
    </div>
  );
}