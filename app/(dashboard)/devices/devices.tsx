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
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { DEVICE_STATUS, DeviceStatus } from "@/app/api/schemas";
import { ComponentProps } from "react";
import { Status } from "@/components/ui/status";

export function Devices() {
  const trpc = useTRPC();
  const devices = useQuery({
    ...trpc.devices.queryOptions(),
    refetchInterval: 10_000,
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <h1 className="text-2xl font-bold">Devices</h1>

      <Table className="table-fixed max-w-7xl">
        <TableCaption>A list of your adopted Devices.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-2">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead className="w-[200px]">Device</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.data?.map((device) => (
            <TableRow
              key={device.name}
              className={cn({
                "animate-pulse": device.status === DEVICE_STATUS.UNHEALTHY,
              })}
            >
              <TableCell className="w-2">
                <Status {...deviceStatusProps(device.status)} />
              </TableCell>
              <TableCell className="font-medium ">{device.name}</TableCell>

              <TableCell className="font-medium">{device.status}</TableCell>
              <TableCell className="font-medium">{device.ip}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function deviceStatusProps(
  status: DeviceStatus
): ComponentProps<typeof Status> {
  if (status === DEVICE_STATUS.HEALTHY) {
    return {
      color: "green",
      animate: false,
    };
  }

  if (status === DEVICE_STATUS.UNHEALTHY) {
    return {
      color: "red",
      animate: true,
    };
  }

  return {
    color: "gray",
    animate: false,
  };
}
