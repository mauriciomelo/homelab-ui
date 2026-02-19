import { getApps } from '@/app/api/applications';
import { appSchema } from '@/app/api/schemas';
import { createApp, restartApp, updateApp } from '@/app/api/applications';
import {
  createBootstrapToken,
  deleteNode,
  devices,
  drainNode,
  getPodsForNode,
  uncordonNode,
} from '@/app/api/devices';
import { getDiscoveredNodes } from '@/mdns';
import { os } from '@orpc/server';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import z from 'zod/v4';

export const controlPlaneRouter = {
  apps: {
    list: os.handler(async () => {
      return getApps();
    }),
    create: os.input(appSchema).handler(async ({ input }) => {
      return createApp(input);
    }),
    update: os.input(appSchema).handler(async ({ input }) => {
      return updateApp(input);
    }),
  },
  devices: {
    list: os.handler(async () => {
      return devices();
    }),
    discoveredNodes: os.handler(async () => {
      return Array.from(getDiscoveredNodes().entries());
    }),
    apps: os.handler(async () => {
      return getApps();
    }),
    restartApp: os
      .input(
        z.object({
          name: z.string().min(1),
        }),
      )
      .handler(async ({ input }) => {
        return restartApp(input.name);
      }),
    joinCluster: os
      .input(
        z.object({
          token: z.string().min(1).max(300),
        }),
      )
      .handler(async ({ input }) => {
        const execAsync = util.promisify(exec);
        const res = await execAsync(`./join_cluster.sh '${input.token}'`);

        console.log(res.stdout);
        console.error(res.stderr);
      }),
    adopt: os
      .input(
        z.object({
          name: z.string().min(1).max(100),
          ip: z.ipv4(),
          port: z.number().min(1).max(65535),
        }),
      )
      .handler(async ({ input }) => {
        const remoteNodeUrl = `http://${input.ip}:${input.port}/api/join`;
        const masterNodeIp = (await devices()).find(
          (node) => node.isMaster,
        )?.ip;
        const masterNodeUrl = `https://${masterNodeIp}:6443`;

        const joinToken = await createBootstrapToken();

        await axios.post(remoteNodeUrl, {
          token: joinToken.joinToken,
          serverUrl: masterNodeUrl,
        });

        await waitFor(async () => {
          const nodes = await devices();
          return nodes.some((node) => node.ip === input.ip);
        });
      }),
    reset: os
      .input(
        z.object({
          name: z.string().min(1).max(100),
          ip: z.ipv4(),
          port: z.number().min(1).max(65535),
        }),
      )
      .handler(async ({ input }) => {
        await drainAndWait(input.name);
        await deleteNode(input.name);
        await remoteReset({ ip: input.ip, port: input.port });

        await waitFor(async () => {
          const nodes = await devices();
          return !nodes.some((node) => node.ip === input.ip);
        });
      }),
    drainCurrentNodeApps: os
      .input(
        z.object({
          name: z.string().min(1).max(100),
        }),
      )
      .handler(async ({ input }) => {
        await drainAndWait(input.name);
        await uncordonNode(input.name);
      }),
  },
};

async function drainAndWait(name: string) {
  await drainNode(name);

  try {
    await waitFor(async () => {
      const pods = await getPodsForNode(name);
      return pods.length === 0;
    });
  } catch (error) {
    console.warn(`Timeout while draining node ${name}:`, error);
    console.warn('Remaining pods:', await getPodsForNode(name));
  }
}

async function remoteReset({ ip, port }: { ip: string; port: number }) {
  const remoteNodeUrl = `http://${ip}:${port}/api/reset`;

  try {
    await axios.post(remoteNodeUrl);
  } catch (error) {
    throw new Error(`Failed to send reset command to ${ip}:${port}: ${error}`);
  }
}

async function waitFor(
  asyncFn: () => Promise<boolean>,
  {
    interval = 2000,
    retries = 10,
  }: { interval?: number; retries?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const result = await asyncFn();
    if (result) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Operation timed out');
}
