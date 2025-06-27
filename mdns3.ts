// advertise-bonjour.js
import { Bonjour } from "bonjour-service";

// 1. All your configuration is now in a single, clean object.
const serviceConfig = {
  name: "podinfo2.home.mauriciomelo", // The human-readable name
  type: "http", // Note: the leading '_' and trailing '._tcp' are added automatically
  port: 80,
  host: "192.168.0.77", // The library handles multi-label hosts perfectly
};

console.log("Initializing Bonjour service advertiser...");

// 2. Instantiate the Bonjour service.
const bonjour = new Bonjour();

// 3. Publish the service with the config. This one function call does everything.
const service = bonjour.publish(serviceConfig);
// const publishDns = bonjour.publish({
//   type: "A",
//   port: 80,
//   name: "podinfo2.home.mauriciomelo.local",
//   host: "192.168.0.77",
// });

console.log("Service publication initiated. Waiting for it to go live...");

// 4. Add listeners for feedback.
service.on("up", () => {
  console.log("----------------------------------------------------");
  console.log(`Service is up and running!`);
  console.log(`Name: "${serviceConfig.name}"`);
  console.log(`Type: _${serviceConfig.type}._tcp.local`);
  console.log(`Host: ${serviceConfig.host} -> (resolves to this machine's IP)`);
  console.log(`Port: ${serviceConfig.port}`);
  console.log("You can now see this service in a Bonjour/mDNS browser.");
  console.log("----------------------------------------------------");
});

service.on("error", (error) => {
  console.error("Error publishing service:", error);
  // Optional: You might want to stop the process if the service fails to start.
  process.exit(1);
});

// To stop the service gracefully on Ctrl+C
process.on("SIGINT", () => {
  console.log("\nStopping service...");
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    console.log("Service stopped.");
    process.exit(0);
  });
});
