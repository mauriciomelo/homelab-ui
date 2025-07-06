"use client";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApplicationForm } from "./application-form";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { APP_STATUS } from "@/app/api/schemas";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useState } from "react";
import { App } from "@/app/api/applications";
import { Status } from "@/components/ui/status";
import { PageContent } from "@/components/page-content";
import { AppIcon, appStatusProps } from "@/components/app-icon";

export function Apps() {
  const trpc = useTRPC();
  const apps = useQuery({ ...trpc.apps.queryOptions(), refetchInterval: 2000 });
  const [selectedApp, setSelectedApp] = useState<App | null>(null);

  return (
    <>
      <PageContent>
        <Table className="max-w-7xl table-fixed">
          <TableCaption>A list of your installed Apps.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-[200px] font-medium text-gray-600">
                App
              </TableHead>
              <TableHead className="font-medium text-gray-600">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.data?.map((app) => (
              <TableRow
                key={app.spec.name}
                className={cn({
                  "animate-pulse": app.status === APP_STATUS.PENDING,
                })}
              >
                <TableCell className="w-2">
                  <Status {...appStatusProps(app.status)} />
                </TableCell>
                <TableCell>
                  <div className="size-4">
                    <AppIcon app={app} showStatus={false} />
                  </div>
                </TableCell>
                <TableCell
                  className="cursor-pointer font-medium"
                  onClick={() => setSelectedApp(app)}
                >
                  <div className="flex min-h-9 items-center">
                    {app.spec.name}
                  </div>
                </TableCell>

                <TableCell className="font-medium">{app.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Sheet
          open={!!selectedApp}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedApp(null);
            }
          }}
        >
          <SheetContent className="w-[600px] sm:max-w-[600px]">
            <SheetHeader>
              <SheetTitle>{selectedApp?.spec.name}</SheetTitle>
              <SheetDescription>
                Edit the App&apos;s configuration.
              </SheetDescription>
            </SheetHeader>
            {selectedApp && (
              <ApplicationForm className="p-4" data={selectedApp.spec} />
            )}
          </SheetContent>
        </Sheet>
      </PageContent>
    </>
  );
}
