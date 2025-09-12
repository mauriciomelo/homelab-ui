import { cn } from '@/lib/utils';

export function PageContent({
  children,
  className,
}: React.HTMLProps<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'mx-2 my-8 flex w-fit flex-1 flex-col gap-4 rounded-lg p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
