import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const InsetGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-card text-card-foreground divide-y overflow-hidden rounded-xl border',
      className,
    )}
    {...props}
  />
));
InsetGroup.displayName = 'InsetGroup';

const InsetSectionTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-muted-foreground px-1 pb-2 text-xs font-medium tracking-wider uppercase',
      className,
    )}
    {...props}
  />
));
InsetSectionTitle.displayName = 'InsetSectionTitle';

interface InsetRowProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

const InsetRow = React.forwardRef<HTMLDivElement, InsetRowProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';
    return (
      <Comp
        ref={ref}
        className={cn('group flex items-center gap-4 p-3', className)}
        {...props}
      />
    );
  },
);
InsetRow.displayName = 'InsetRow';

interface InsetLabelProps extends React.ComponentPropsWithoutRef<typeof Label> {
  asChild?: boolean;
}

const InsetLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  InsetLabelProps
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : Label;
  return (
    <Comp
      ref={ref}
      className={cn(
        'text-foreground flex w-40 shrink-0 items-center gap-2 text-sm font-medium',
        className,
      )}
      {...props}
    />
  );
});
InsetLabel.displayName = 'InsetLabel';

const InsetInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentPropsWithoutRef<typeof Input>
>(({ className, ...props }, ref) => (
  <Input
    ref={ref}
    className={cn(
      'hover:bg-muted/50 h-auto rounded-md border-0 bg-transparent px-2 py-1 text-right font-mono text-sm shadow-none transition-colors focus-visible:ring-0',
      className,
    )}
    {...props}
  />
));
InsetInput.displayName = 'InsetInput';

export { InsetGroup, InsetSectionTitle, InsetRow, InsetLabel, InsetInput };
