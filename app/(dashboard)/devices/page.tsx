import { HydrateClient, prefetch, trpc } from "@/trpc/server";
import { Devices } from "./devices";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  await prefetch(trpc.devices.queryOptions());

  return (
    <HydrateClient>
      <Devices />
    </HydrateClient>
  );
}
