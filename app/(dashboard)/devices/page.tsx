import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { Devices } from "./devices";

export default async function DevicesPage() {
  await prefetch(trpc.devices.queryOptions());

  return (
    <HydrateClient>
      <Devices />
    </HydrateClient>
  );
}
