import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { getApps } from "@/app/api/applications";
import { createBootstrapToken, devices, resetDevice } from "@/app/api/devices";
import { getDiscoveredNodes } from "@/mdns";
import { exec } from "child_process";
import util from "util";

export const appRouter = createTRPCRouter({
  apps: baseProcedure.query(() => {
    return getApps();
  }),
  devices: baseProcedure.query(() => {
    return devices();
  }),
  discoveredNodes: baseProcedure.query(() => {
    return getDiscoveredNodes();
  }),
  joinCluster: baseProcedure
    .input(
      z.object({
        token: z.string().min(1).max(300),
      })
    )
    .mutation(async (opts) => {
      const { token } = opts.input;

      const execAsync = util.promisify(exec);

      const res = await execAsync(`./join_cluster.sh '${token}'`);

      console.log(res.stdout);
      console.error(res.stderr);
    }),
  adoptDevice: baseProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        ip: z.string().ip(),
        port: z.number().min(1).max(65535),
      })
    )
    .mutation(async (opts) => {
      const { name, ip, port } = opts.input;

      // Implement your adoption logic here
      console.log(`\n\n\nAdopting device: ${name} at ${ip}:${port}\n\n\n`);

      // TODO: support HTTPS here to transport the token securely
      const remoteNodeUrl = `http://${ip}:${port}/api/join`;

      const masterNodeIp = (await devices()).find((node) => node.isMaster)?.ip;

      const masterNodeUrl = `https://${masterNodeIp}:6443`;

      const joinToken = await createBootstrapToken();

      const res = await fetch(remoteNodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: joinToken.joinToken,
          serverUrl: masterNodeUrl,
        }),
      });

      await waitFor(async () => {
        const nodes = await devices();
        return nodes.some((node) => node.ip === ip);
      });

      console.log(await res.json());
    }),
  resetDevice: baseProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        ip: z.string().ip(),
        port: z.number().min(1).max(65535),
      })
    )
    .mutation(async (opts) => {
      const { name, ip, port } = opts.input;

      const remoteNodeUrl = `http://${ip}:${port}/api/reset`;

      await resetDevice(name);

      await fetch(remoteNodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      await waitFor(async () => {
        const nodes = await devices();
        return !nodes.some((node) => node.ip === ip);
      });
    }),
});

export type AppRouter = typeof appRouter;

async function waitFor(
  asyncFn: () => Promise<boolean>,
  {
    interval = 2000,
    retries = 10,
  }: { interval?: number; retries?: number } = {}
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const result = await asyncFn();
    if (result) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Operation timed out");
}
