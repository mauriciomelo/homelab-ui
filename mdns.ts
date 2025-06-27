import { Bonjour } from "bonjour-service";

console.log("Initializing mDNS service advertiser...");

const bonjour = new Bonjour();
const id = crypto.randomUUID();

const serviceName = `homelab-${id}`;

const service = bonjour.publish({
  name: serviceName,
  type: "http",
  host: `${serviceName}.local`,
  txt: {
    kind: "cluster-node",
  },
  port: 3000,
});

console.log("Service publication initiated. Waiting for it to go live...");

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

process.on("SIGINT", () => {
  console.log("\nStopping mDNS service...");
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    console.log("mDNS service stopped.");
    process.exit(0);
  });
});
