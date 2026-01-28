'use client';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  InsetGroup,
  InsetInput,
  InsetLabel,
  InsetRow,
  InsetSectionTitle,
} from '@/components/ui/inset-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle, Package } from 'lucide-react';
import type { Lens } from '@hookform/lenses';
import type { AppSchema } from '@/app/api/schemas';

type AppBasicsSectionProps = {
  lens: Lens<AppSchema>;
  mode: 'edit' | 'create';
};

export function AppBasicsSection({ lens, mode }: AppBasicsSectionProps) {
  const nameInterop = lens.focus('name').interop();
  const imageInterop = lens.focus('image').interop();

  return (
    <div className="flex flex-col gap-2">
      <InsetSectionTitle id="app-basics-title">App Basics</InsetSectionTitle>
      <InsetGroup role="group" aria-labelledby="app-basics-title">
        <FormField
          control={nameInterop.control}
          name={nameInterop.name}
          render={({ field }) => (
            <InsetRow asChild>
              <FormItem className="space-y-0">
                <InsetLabel asChild>
                  <FormLabel>App Name</FormLabel>
                </InsetLabel>
                <FormControl>
                  <InsetInput
                    placeholder="App Name"
                    readOnly={mode === 'edit'}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </InsetRow>
          )}
        />
        <FormField
          control={imageInterop.control}
          name={imageInterop.name}
          render={({ field }) => (
            <InsetRow asChild>
              <FormItem className="space-y-0">
                <InsetLabel asChild>
                  <FormLabel>
                    <Package className="text-muted-foreground h-4 w-4" />
                    Container Image
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="text-muted-foreground h-4 w-4 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Include the full registry path and tag.
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                </InsetLabel>
                <div className="flex-1 min-w-0">
                  <FormControl>
                    <InsetInput
                      placeholder="nginx:latest or registry.example.com/my-app:v1.0.0"
                      className="text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </div>
              </FormItem>
            </InsetRow>
          )}
        />
      </InsetGroup>
    </div>
  );
}
