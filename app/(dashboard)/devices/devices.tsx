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
import { DEVICE_STATUS } from "@/app/api/schemas";
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
  LineChart,
  MemoryStick,
  Monitor,
  Network,
  RotateCcw,
  Tag,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageContent } from "@/components/page-content";
import { DiscoveredNode } from "@/mdns";
import { ClusterNode } from "@/app/api/devices";
import _ from "lodash";
import { App } from "@/app/api/applications";
import { AppIcon } from "@/components/app-icon";

type Device = DiscoveredNode | (ClusterNode & { port?: number });

function nodeApps(apps: App[], nodeName: string) {
  return apps.filter((app) =>
    app.pods.some((pod) => pod.spec.nodeName === nodeName),
  );
}

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
  const apps = useQuery({
    ...trpc.apps.queryOptions(),
    refetchInterval: 5_000,
  });

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: trpc.devices.queryKey() });
    queryClient.invalidateQueries({
      queryKey: trpc.discoveredNodes.queryKey(),
    });
    queryClient.invalidateQueries({ queryKey: trpc.apps.queryKey() });
  };

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
    await adoptDeviceMutation.mutateAsync({
      name: device.name,
      ip: device.ip,
      port: device.port,
    });

    invalidateQueries();
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = nodes.find((node) => node.ip === selectedId);

  const isNew = selected?.status === DEVICE_STATUS.NEW;

  const runningApps = selected ? nodeApps(apps.data || [], selected.name) : [];

  return (
    <>
      <PageContent>
        <Table className="max-w-7xl table-fixed">
          <TableCaption>A list of your adopted Devices.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead className="w-38">Device</TableHead>
              <TableHead className="w-35">Status</TableHead>
              <TableHead className="w-35">IP Address</TableHead>
              <TableHead>Running Apps</TableHead>
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
                  className="cursor-pointer overflow-hidden font-medium overflow-ellipsis"
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
                <TableCell className="font-medium">
                  <div className="flex flex-wrap gap-2">
                    {nodeApps(apps.data || [], device.name).map((app) => (
                      <div className="size-5" key={app.name}>
                        <AppIcon app={app} />
                      </div>
                    ))}
                  </div>
                </TableCell>
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
          <SheetContent className="bg-sidebar-accent w-[600px] sm:max-w-[600px]">
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
                <div className="m-4 flex h-22 flex-row items-end">
                  <Alert
                    className={cn("flex transition-all", {
                      "flex-col border-blue-400 bg-blue-50 text-blue-900":
                        isNew,
                      "flex-row items-center justify-between border-none":
                        !isNew,
                    })}
                  >
                    <AlertTitle className="flex items-center gap-2 font-medium">
                      <Status {...statusLedProps(selected.status)} />{" "}
                      {isNew ? "Ready for adoption" : selected.status}
                    </AlertTitle>
                    <AlertDescription
                      className={cn(
                        "flex flex-row items-center justify-between text-black",
                        {
                          "w-full": isNew,
                        },
                      )}
                    >
                      <div className="flex-1 text-xs text-blue-900">
                        {isNew
                          ? "Expand cluster capacity by adopting this device."
                          : null}
                      </div>

                      {isNew ? (
                        <Button
                          onClick={() => handleAdoptDevice(selected!)}
                          disabled={adoptDeviceMutation.isPending || !isNew}
                        >
                          {adoptDeviceMutation.isPending
                            ? "Adopting..."
                            : "Adopt Device"}
                        </Button>
                      ) : (
                        <Button variant="outline" asChild>
                          <a
                            href={`http://grafana.home.mauriciomelo.io/d/cehfovv63aneoe-cluster-otel/cluster?orgId=1&from=now-30m&to=now&timezone=browser&var-Node=${selected.name}&refresh=5s`}
                            target="_blank"
                          >
                            <LineChart />
                            Explore Metrics
                          </a>
                        </Button>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>

                <div className="m-4 flex items-center justify-between rounded-lg bg-white p-4">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Running Apps
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {runningApps.length > 0 ? (
                      runningApps.map((app) => (
                        <div className="size-6" key={app.name}>
                          <AppIcon app={app} />
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">
                        No running apps yet
                      </div>
                    )}
                  </div>
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
      </PageContent>
    </>
  );
}

function DeleteDeviceDialog({ device }: { device: Device }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const queryClient = useQueryClient();

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: trpc.devices.queryKey() });
    queryClient.invalidateQueries({
      queryKey: trpc.discoveredNodes.queryKey(),
    });
    queryClient.invalidateQueries({ queryKey: trpc.apps.queryKey() });
  };

  const resetDeviceMutation = useMutation(trpc.resetDevice.mutationOptions());

  const handleDelete = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    assert(typeof device.port === "number", "Port is required");
    await resetDeviceMutation.mutateAsync({
      name: device.name,
      ip: device.ip,
      port: device.port,
    });

    invalidateQueries();

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
          disabled={
            resetDeviceMutation.isPending ||
            ("isMaster" in device && device.isMaster)
          }
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

function kibiBytesToGigabytes(size: unknown): string {
  if (!size || typeof size !== "string") return "Unknown";
  if (!size.includes("Ki")) return "Unknown";

  const sizeInteger = Number.parseInt(size.replace("Ki", ""));

  const gigabytes = sizeInteger / 976600;

  return `${gigabytes.toFixed(1)} GB`;
}

function NodeDetails({ node }: { node: Device }) {
  const UNKNOWN = "Unknown";

  const osImage = node.nodeInfo.osImage ? ` (${node.nodeInfo.osImage})` : "";
  const storage = kibiBytesToGigabytes(
    _.get(node, ["capacity", "ephemeral-storage"]),
  );

  const memory = kibiBytesToGigabytes(node.capacity?.memory);

  const sections = [
    {
      title: "Info",
      items: [
        {
          label: "Name",
          value: node.name,
          icon: Tag,
          color: "group-hover:text-blue-500",
        },
        {
          label: "Architecture",
          value: node.nodeInfo.architecture || UNKNOWN,
          icon: Cpu,
          color: "group-hover:text-purple-500",
        },
        {
          label: "Operating System",
          value:
            `${_.capitalize(node.nodeInfo.operatingSystem)}${osImage}` ||
            UNKNOWN,
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
          value: node.capacity?.cpu || UNKNOWN,
          icon: Cpu,
          color: "group-hover:text-purple-500",
        },
        {
          label: "Storage",
          value: storage,
          icon: HardDrive,
          color: "group-hover:text-green-500",
        },
        {
          label: "Memory",
          value: memory,
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
          className="m-4 space-y-1 rounded-lg bg-white p-4"
        >
          <h4 className="mb-3 text-sm font-semibold text-gray-700">
            {section.title}
          </h4>
          {section.items.map((item) => (
            <div
              key={item.label}
              className="group flex items-center justify-between p-2 text-sm font-medium"
            >
              <div className="flex items-center space-x-2 text-gray-600">
                <item.icon
                  className={cn(`h-4 w-4 transition-colors`, item.color)}
                />
                <span className="">{item.label}:</span>
              </div>
              <span className="text-gray-600">{item.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
