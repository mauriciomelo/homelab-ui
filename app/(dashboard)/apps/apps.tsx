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
import { APP_STATUS, AppStatus } from "@/app/api/schemas";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ComponentProps, useState } from "react";
import { App } from "@/app/api/applications";
import { Status } from "@/components/ui/status";

export function Apps() {
  const trpc = useTRPC();
  const apps = useQuery({ ...trpc.apps.queryOptions(), refetchInterval: 2000 });
  const [selectedApp, setSelectedApp] = useState<App | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <h1 className="text-2xl font-bold">Apps</h1>

      <Table className="table-fixed max-w-7xl">
        <TableCaption>A list of your installed Apps.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-2">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead className="w-[200px]">App</TableHead>
            <TableHead>Status</TableHead>
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
              <TableCell
                className="font-medium cursor-pointer"
                onClick={() => setSelectedApp(app)}
              >
                {app.spec.name}
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
        <SheetContent className="w-[600px] sm:max-w-[600px] ">
          <SheetHeader>
            <SheetTitle>{selectedApp?.spec.name}</SheetTitle>
            <SheetDescription>Edit the App's configuration.</SheetDescription>
          </SheetHeader>
          {selectedApp && (
            <ApplicationForm className="p-4" data={selectedApp.spec} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function appStatusProps(status: AppStatus): ComponentProps<typeof Status> {
  if (status === APP_STATUS.RUNNING) {
    return {
      color: "green",
      animate: false,
    };
  }

  if (status === APP_STATUS.PENDING) {
    return {
      color: "orange",
      animate: true,
    };
  }

  return {
    color: "gray",
    animate: false,
  };
}
