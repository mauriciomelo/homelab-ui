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
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ApplicationForm } from "./application-form";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { APP_STATUS, AppStatus } from "@/app/api/schemas";

export function Apps() {
  const trpc = useTRPC();
  const apps = useQuery({ ...trpc.apps.queryOptions(), refetchInterval: 2000 });
  const selectedApp = apps.data?.[0];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <h1 className="text-2xl font-bold">Apps</h1>

      <Table className="table-fixed">
        <TableCaption>A list of your installed Apps.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-2">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead>App</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.data?.map((app) => (
            <TableRow key={app.spec.name}>
              <TableCell className="w-2">
                <StatusIcon status={app.status} />
              </TableCell>
              <TableCell className="font-medium">
                <Link target="_blank" href={app.link}>
                  {app.spec.name}
                </Link>
              </TableCell>

              <TableCell className="font-medium">{app.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedApp && <ApplicationForm data={selectedApp.spec} />}
    </div>
  );
}

function StatusIcon({ status }: { status: AppStatus }) {
  const shared = cn("inline-flex h-full w-full rounded-full", {
    "bg-green-400": status === APP_STATUS.RUNNING,
    "bg-orange-400 animate-ping": status === APP_STATUS.PENDING,
  });

  return (
    <span className="relative flex size-2">
      <span className={cn(shared, "absolute opacity-50")}></span>
      <span className={cn(shared, "relative animate-none")}></span>
    </span>
  );
}
