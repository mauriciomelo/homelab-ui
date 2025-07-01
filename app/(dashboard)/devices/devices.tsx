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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEVICE_STATUS, DeviceStatus } from "@/app/api/schemas";
import { useState } from "react";
import { Status } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { MiniPCScene } from "./mini-pc";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Sheet,
  SheetFooter,
} from "@/components/ui/sheet";
import { statusLedProps } from "./statusLedProps";
import assert from "assert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw } from "lucide-react";

type Device = {
  ip: string;
  port?: number;
  name: string;
  status: DeviceStatus;
};

export function Devices() {
  const trpc = useTRPC();
  const devices = useQuery({
    ...trpc.devices.queryOptions(),
    refetchInterval: 10_000,
  });
  const queryClient = useQueryClient();

  const discoveredNodes = useQuery({
    ...trpc.discoveredNodes.queryOptions(),
    refetchInterval: 5_000,
  });
  const currentDevices = devices.data || [];

  const newDevices =
    discoveredNodes.data
      ?.filter((node) => {
        return currentDevices?.every((device) => device.ip !== node.ip);
      })
      .map((node) => ({ ...node, status: DEVICE_STATUS.NEW })) || [];

  const nodes = [...currentDevices, ...newDevices];

  const adoptDeviceMutation = useMutation(trpc.adoptDevice.mutationOptions());

  const handleAdoptDevice = async (device: Device) => {
    assert(typeof device.port === "number", "Port is required");
    setSelectedId(device.ip);
    await adoptDeviceMutation.mutateAsync({
      name: device.name,
      ip: device.ip,
      port: device.port,
    });

    queryClient.invalidateQueries({ queryKey: trpc.devices.queryKey() });
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = nodes.find((node) => node.ip === selectedId);

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
          {nodes.map((device) => (
            <TableRow
              key={`${device.name}-${device.ip}`}
              className={cn({
                "animate-pulse": device.status === DEVICE_STATUS.UNHEALTHY,
              })}
            >
              <TableCell className="w-2">
                <Status {...statusLedProps(device.status)} />
              </TableCell>
              <TableCell
                onClick={() => setSelectedId(device.ip)}
                className="font-medium overflow-ellipsis overflow-hidden"
              >
                {device.name}
              </TableCell>

              <TableCell className="font-medium">
                {device.status === DEVICE_STATUS.NEW ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAdoptDevice(device)}
                    disabled={adoptDeviceMutation.isPending}
                  >
                    {adoptDeviceMutation.isPending
                      ? "Adopting..."
                      : "Adopt Device"}
                  </Button>
                ) : (
                  device.status
                )}
              </TableCell>
              <TableCell className="font-medium">{device.ip}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
      >
        <SheetContent className="w-[600px] sm:max-w-[600px] ">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>Overview</SheetDescription>
          </SheetHeader>
          {selected && (
            <div>
              <MiniPCScene
                status={selected.status}
                adopting={adoptDeviceMutation.isPending}
              />
            </div>
          )}
          <SheetFooter>
            {selected && selected.status !== DEVICE_STATUS.NEW && (
              <DeleteDeviceDialog device={selected} />
            )}

            {selected && selected.status === DEVICE_STATUS.NEW && (
              <Button
                onClick={() => handleAdoptDevice(selected!)}
                disabled={adoptDeviceMutation.isPending}
              >
                {adoptDeviceMutation.isPending ? "Adopting..." : "Adopt Device"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DeleteDeviceDialog({ device }: { device: Device }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const queryClient = useQueryClient();

  const resetDeviceMutation = useMutation(trpc.resetDevice.mutationOptions());

  const handleDelete = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    await resetDeviceMutation.mutateAsync({
      name: device.name,
      ip: device.ip,
      port: 3000,
    });

    queryClient.invalidateQueries({ queryKey: trpc.devices.queryKey() });

    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <RotateCcw />
          Reset Device
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Device</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to reset this device? This action cannot be
            undone. All data and configurations will be permanently deleted, and
            the device will be restored to factory settings.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetDeviceMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            onClick={handleDelete}
            disabled={resetDeviceMutation.isPending}
          >
            {resetDeviceMutation.isPending ? "Resetting..." : "Reset Device"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
