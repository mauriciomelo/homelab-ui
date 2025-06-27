// advertise-remote-service.js
import multicastDns from "multicast-dns";

// --- Configuration ---
// Here you have full control to specify any IP address you want.
const REMOTE_IP_ADDRESS = "192.168.0.77"; // The IP of the *other* machine

const SERVICE_NAME = "podinfo2"; // The human-readable name
const SERVICE_TYPE = "_http._tcp";
const SERVICE_PORT = 80;
const HOSTNAME = "podinfo2.local";
const IP_TTL_SECONDS = 300;

const TXT_RECORDS = {
  location: "remote-machine",
  advertised_by: "nodejs-script",
};

// --- Protocol Names (auto-generated) ---
const SERVICE_TYPE_NAME = `${SERVICE_TYPE}.local`;
const INSTANCE_NAME = `${SERVICE_NAME}.${SERVICE_TYPE_NAME}`;

console.log("Initializing mDNS remote service advertiser...");

const mdns = multicastDns();

mdns.on("query", (query) => {
  for (const question of query.questions) {
    // 1. Respond to PTR queries for the service type
    if (question.type === "PTR" && question.name === SERVICE_TYPE_NAME) {
      mdns.respond({
        answers: [
          {
            name: SERVICE_TYPE_NAME,
            type: "PTR",
            ttl: IP_TTL_SECONDS,
            data: INSTANCE_NAME,
          },
        ],
      });
    }

    console.log(`Received query for ${question.name} (${question.type})`);

    // 2. Respond to SRV/TXT queries for our specific service instance
    if (
      (question.type === "SRV" || question.type === "ANY") &&
      question.name === INSTANCE_NAME
    ) {
      mdns.respond({
        answers: [
          {
            name: INSTANCE_NAME,
            type: "SRV",
            ttl: IP_TTL_SECONDS,
            data: { port: SERVICE_PORT, target: HOSTNAME },
          },
          {
            name: INSTANCE_NAME,
            type: "TXT",
            ttl: IP_TTL_SECONDS,
            data: Object.entries(TXT_RECORDS).map(
              ([key, value]) => `${key}=${value}`
            ),
          },
        ],
      });
    }

    // 3. Respond to A queries for our hostname with the REMOTE IP
    if (
      (question.type === "A" || question.type === "ANY") &&
      question.name === HOSTNAME
    ) {
      console.log(
        `Responding to A query for ${HOSTNAME} with IP ${REMOTE_IP_ADDRESS}`
      );
      mdns.respond({
        answers: [
          {
            name: HOSTNAME,
            type: "A",
            ttl: IP_TTL_SECONDS,
            data: REMOTE_IP_ADDRESS, // <-- The crucial part for your use case
          },
        ],
      });
    }
  }
});

console.log("mDNS remote advertiser started.");
console.log(`Advertising service "${SERVICE_NAME}" pointing to ${HOSTNAME}`);
console.log(`Which in turn points to remote IP: ${REMOTE_IP_ADDRESS}`);
