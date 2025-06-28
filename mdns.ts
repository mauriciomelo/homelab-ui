import assert from "assert";
import { Bonjour } from "bonjour-service";

const bonjour = new Bonjour();
const id = crypto.randomUUID();

const serviceName = `homelab-${id}`;

const CLUSTER_NODE = "cluster-node";

export function publishService() {
  console.log("Initializing mDNS service advertiser...");
  console.log(`Publishing service with name: ${serviceName}`);

  const service = bonjour.publish({
    name: serviceName,
    type: "http",
    host: `${serviceName}.local`,
    txt: {
      kind: CLUSTER_NODE,
    },
    port: 3000,
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

type ClusterNode = {
  name: string;
  ip: string;
  port: number;
};

const nodes = new Map<string, ClusterNode>();

export function getDiscoveredNodes(): ClusterNode[] {
  return Array.from(nodes.values());
}

bonjour.find({ type: "http" }, function (service) {
  if (service.txt && service.txt.kind === CLUSTER_NODE) {
    try {
      assert(service.referer?.address, "Service referer address is undefined");

      const node: ClusterNode = {
        name: service.name,
        ip: service.referer.address,
        port: service.port,
      };

      nodes.set(service.name, node);

      console.log(
        `Cluster Node Discovered: ${service.name} at ${service.host}:${service.port}`
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
