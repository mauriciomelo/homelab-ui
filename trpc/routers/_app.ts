import { z } from "zod";
import { baseProcedure, createCallerFactory, createTRPCRouter } from "../init";
import { getApps } from "@/app/api/applications";
import { createBootstrapToken, devices } from "@/app/api/devices";
import { getDiscoveredNodes } from "@/mdns";
import { exec } from "child_process";
import util from "util";
import path from "path";

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

      console.log({ joinToken, masterNodeUrl });

      const scriptPath = path.resolve(
        "/home/mauricio/homelab-ui",
        "join_cluster.sh"
      );

      const command = `K3S_URL=${masterNodeUrl} K3S_TOKEN=${joinToken.joinToken} ${scriptPath}`;
      console.log({ command });

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

      console.log(await res.json());
    }),
});

export type AppRouter = typeof appRouter;
