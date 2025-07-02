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
import {
  Cpu,
  HardDrive,
  Heart,
  LineChart,
  MemoryStick,
  Monitor,
  Network,
  RotateCcw,
  Tag,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
  const currentDevices =
    devices.data?.map((device) => ({
      ...device,
      port: discoveredNodes.data?.get(device.ip)?.port,
    })) || [];

  const newDevices =
    Array.from(discoveredNodes?.data?.values() || [])
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

  const isNew = selected?.status === DEVICE_STATUS.NEW;
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
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
        <SheetContent className="w-[600px] sm:max-w-[600px] bg-sidebar-accent">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>Device details</SheetDescription>
          </SheetHeader>
          {selected && (
            <div>
              <div>
                <MiniPCScene
                  status={selected.status}
                  adopting={adoptDeviceMutation.isPending}
                />
              </div>
              <div className="m-4 flex flex-col items-end">
                <Alert
                  className={cn(
                    "border-blue-400 text-blue-900  bg-blue-50 transition-opacity",
                    {
                      "opacity-0": !isNew,
                    }
                  )}
                >
                  <AlertTitle className="font-medium flex items-center gap-2">
                    <Status {...statusLedProps(selected.status)} /> Ready for
                    adoption
                  </AlertTitle>
                  <AlertDescription className="flex flex-row justify-between items-center">
                    <span className="text-xs text-blue-900">
                      Expand cluster capacity by adopting this device.
                    </span>
                    <Button
                      onClick={() => handleAdoptDevice(selected!)}
                      disabled={adoptDeviceMutation.isPending || !isNew}
                    >
                      {adoptDeviceMutation.isPending
                        ? "Adopting..."
                        : "Adopt Device"}
                    </Button>
                  </AlertDescription>
                </Alert>

                <Button
                  variant="outline"
                  className={cn("mt-4", {
                    "opacity-0": isNew,
                  })}
                  asChild
                  disabled={isNew}
                >
                  <a
                    href={`http://grafana.home.mauriciomelo.io/d/cehfovv63aneoe-cluster-otel/cluster?orgId=1&from=now-30m&to=now&timezone=browser&var-Node=${selected.name}&refresh=5s`}
                    target="_blank"
                  >
                    <LineChart />
                    Explore Metrics
                  </a>
                </Button>
              </div>

              <NodeDetails node={selected} />

              {selected && !isNew && (
                <div className="m-4">
                  <DeleteDeviceDialog device={selected} />
                </div>
              )}
            </div>
          )}
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
    assert(typeof device.port === "number", "Port is required");
    await resetDeviceMutation.mutateAsync({
      name: device.name,
      ip: device.ip,
      port: device.port,
    });

    queryClient.invalidateQueries({ queryKey: trpc.devices.queryKey() });

    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="w-fit text-red-500"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <RotateCcw />
          Factory Reset
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

function NodeDetails({ node }: { node: Device }) {
  const sections = [
    {
      title: "Info",
      items: [
        {
          label: "Status",
          value: (
            <div className="flex items-center gap-2">
              <Status {...statusLedProps(node.status)} />
              {node.status}
            </div>
          ),
          icon: Heart,
          color: "group-hover:text-green-500",
        },
        {
          label: "Name",
          value: node.name,
          icon: Tag,
          color: "group-hover:text-blue-500",
        },
        {
          label: "Architecture",
          value: "amd64",
          icon: Cpu,
          color: "group-hover:text-purple-500",
        },
        {
          label: "Operating System",
          value: "Linux (Ubuntu 24.04.1 LTS)",
          icon: Monitor,
          color: "group-hover:text-orange-500",
        },
        {
          label: "IP Address",
          value: node.ip,
          icon: Network,
          color: "group-hover:text-indigo-500",
        },
      ],
    },
    {
      title: "Capacity",
      items: [
        {
          label: "CPU",
          value: "3 cores",
          icon: Cpu,
          color: "group-hover:text-purple-500",
        },
        {
          label: "Storage",
          value: "40 GB",
          icon: HardDrive,
          color: "group-hover:text-green-500",
        },
        {
          label: "Memory",
          value: "8 GB",
          icon: MemoryStick,
          color: "group-hover:text-red-500",
        },
      ],
    },
  ];

  return (
    <div>
      {sections.map((section) => (
        <div
          key={section.title}
          className="space-y-1 m-4 p-4 bg-white rounded-lg"
        >
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {section.title}
          </h4>
          {section.items.map((item) => (
            <div
              key={item.label}
              className="group flex items-center justify-between text-sm p-2"
            >
              <div className="flex items-center space-x-2">
                <item.icon
                  className={cn(
                    `w-4 h-4 text-gray-400 transition-colors`,
                    item.color
                  )}
                />
                <span className="text-gray-600">{item.label}:</span>
              </div>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
