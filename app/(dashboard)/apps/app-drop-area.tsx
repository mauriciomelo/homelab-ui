'use client';

import type { ReactNode } from 'react';
import { useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import YAML from 'yaml';
import { appSchema, type AppSchema } from '@/app/api/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const useAppDropArea = () => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [data, setData] = useState<AppSchema | null>(null);

  const handleDialogOpenChange = (open: boolean) => {
    setIsConfirmOpen(open);
    if (!open) {
      setPendingFile(null);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isDragActive) {
      setIsDragActive(true);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && relatedTarget instanceof Node) {
      if (event.currentTarget.contains(relatedTarget)) {
        return;
      }
    }
    setIsDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    setValidationError(null);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    setPendingFile(file);
    setIsConfirmOpen(true);
  };

  const handleConfirmYaml = async () => {
    if (!pendingFile) {
      setIsConfirmOpen(false);
      return;
    }

    setValidationError(null);

    try {
      const content = await pendingFile.text();
      const documents = YAML.parseAllDocuments(content);
      const parseErrors = documents.flatMap((document) => document.errors);

      if (parseErrors.length > 0) {
        setValidationError(
          `YAML parse error:\n${parseErrors
            .map((error) => error.message)
            .join('\n')}`,
        );
        return;
      }

      const parsed = YAML.parse(content);
      const result = appSchema.safeParse(parsed);

      if (!result.success) {
        const issues = result.error.issues.map((issue) => issue.message);
        setValidationError(`Invalid app config:\n${issues.join('\n')}`);
        return;
      }

      setData(result.data);
      setIsConfirmOpen(false);
      setPendingFile(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setValidationError(`Unable to read file: ${message}`);
    }
  };

  return {
    data,
    dropAreaProps: {
      isConfirmOpen,
      isDragActive,
      onConfirmYaml: handleConfirmYaml,
      onDialogOpenChange: handleDialogOpenChange,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      pendingFileName: pendingFile?.name ?? 'your file',
      validationError,
    },
  };
};

type AppDropAreaProps = {
  children: ReactNode;
  className?: string;
} & ReturnType<typeof useAppDropArea>['dropAreaProps'];

export function AppDropArea({
  children,
  className,
  isConfirmOpen,
  isDragActive,
  pendingFileName,
  validationError,
  onConfirmYaml,
  onDialogOpenChange,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: AppDropAreaProps) {
  return (
    <div
      className={cn('relative flex min-h-0 flex-1 flex-col', className)}
      data-testid="app-drop-area"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragActive ? (
        <div className="absolute inset-0 z-50">
          <div className="sticky top-0 flex h-screen max-h-full w-full items-center justify-center">
            <div className="m-4 flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white bg-black/60 p-4 text-2xl text-white backdrop-blur-xs">
              <FileUp className="size-10" />
              <div>Drop your app file to fill the form</div>
            </div>
          </div>
        </div>
      ) : null}
      {children}
      <AlertDialog open={isConfirmOpen} onOpenChange={onDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fill the form from the file content?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current form values with the contents of{' '}
              {pendingFileName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {validationError && (
            <Alert variant="destructive" className="my-2">
              <AlertTitle>Validation Error</AlertTitle>
              <AlertDescription className="max-h-[200px] overflow-y-auto text-xs whitespace-pre-line">
                {validationError}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={onConfirmYaml}>Use values</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
