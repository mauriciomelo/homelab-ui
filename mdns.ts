import assert from "assert";
import { Bonjour } from "bonjour-service";
import os from "node:os";
import * as z from "zod/v4";
import { getOptionalConfig } from "./app/(dashboard)/apps/config";

const bonjour = new Bonjour();

const hostname = os.hostname();

const serviceName = `${hostname}_node`;

const CLUSTER_NODE = "cluster-node";

const servicePayloadSchema = z.object({
  kind: z.string().min(1),
  name: z.string().min(1),
  arch: z.string().min(1).default("Unknown"),
  platform: z.string().min(1).default("Unknown"),
  release: z.string().min(1).default("Unknown"),
});

type ServicePayload = z.infer<typeof servicePayloadSchema>;

export function publishService() {
  console.log("Initializing mDNS service advertiser...");
  console.log(`Publishing service with name: ${serviceName}`);

  const config = getOptionalConfig();

  const service = bonjour.publish({
    name: serviceName,
    type: "http",
    host: `${serviceName}.local`,
    txt: {
      kind: CLUSTER_NODE,
      name: hostname,
      arch: os.arch(),
      platform: os.platform(),
      release: os.release(),
    } satisfies ServicePayload,
    port: config.PORT,
  });

  service.on("up", () => {
    console.log("----------------------------------------------------");
    console.log(`Service is up and running!`);
    console.log(`Name: "${serviceName}"`);
    console.log(`Type: _${service.type}._tcp.local`);
    console.log(`Host: ${service.host} -> (resolves to this machine's IP)`);
    console.log(`Port: ${service.port}`);
    console.log("You can now see this service in a Bonjour/mDNS browser.");
    console.log("----------------------------------------------------");
  });

  service.on("error", (error) => {
    console.error("Error publishing service:", error);
    process.exit(1);
  });
}

export type DiscoveredNode = {
  name: string;
  ip: string;
  port: number;
  nodeInfo: {
    architecture?: string;
    operatingSystem?: string;
    osImage?: string;
  };
};

const nodesMap = new Map<string, DiscoveredNode>();

export function getDiscoveredNodes() {
  return nodesMap;
}

bonjour.find({ type: "http" }, function (service) {
  if (service.txt && service.txt.kind === CLUSTER_NODE) {
    try {
      assert(service.referer?.address, "Service referer address is undefined");
      const payload = servicePayloadSchema.parse(service.txt);

      const node: DiscoveredNode = {
        name: payload.name,
        ip: service.referer.address,
        port: service.port,
        nodeInfo: {
          architecture: payload.arch,
          operatingSystem: payload.platform,
          osImage: payload.release,
        },
      };

      nodesMap.set(node.ip, node);

      console.log(
        `Cluster Node Discovered: ${service.name} at ${service.host}:${service.port}`,
      );
    } catch (error) {
      console.error("Error processing service:", error);
    }
  }
});

process.on("SIGINT", () => {
  console.log("\nStopping mDNS service...");
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    console.log("mDNS service stopped.");
    process.exit(0);
  });
});
