// advertise-remote-service.js
import multicastDns from "multicast-dns";

// --- Configuration ---
const REMOTE_IP_ADDRESS = "192.168.0.77";
const REMOTE_IP_ADDRESS_V6 = `::ffff:${REMOTE_IP_ADDRESS}`; // IPv6 representation for mDNS
const SERVICE_NAME = "podinfo2";
const SERVICE_TYPE = "_http._tcp";
const SERVICE_PORT = 80;
const HOSTNAME = "podinfo2.local";
const IP_TTL_SECONDS = 120; // TTL is typically lower for mDNS, e.g., 2 minutes.

const TXT_RECORDS = {
  location: "remote-machine",
  advertised_by: "nodejs-script",
};

// --- Protocol Names (auto-generated) ---
const SERVICE_TYPE_NAME = `${SERVICE_TYPE}.local`;
const INSTANCE_NAME = `${SERVICE_NAME}.${SERVICE_TYPE_NAME}`;

console.log("Initializing mDNS remote service advertiser...");

const mdns = multicastDns();

// --- Define all our records in one place ---
// This is more efficient as we can announce and respond with the same packet.
const records = [
  {
    name: SERVICE_TYPE_NAME,
    type: "PTR",
    flush: true,
    ttl: IP_TTL_SECONDS,
    data: INSTANCE_NAME,
  },
  {
    name: INSTANCE_NAME,
    type: "SRV",
    flush: true,
    ttl: IP_TTL_SECONDS,
    data: { port: SERVICE_PORT, target: HOSTNAME, priority: 10, weight: 10 },
  },
  {
    name: INSTANCE_NAME,
    type: "TXT",
    flush: true,
    ttl: IP_TTL_SECONDS,
    data: Object.entries(TXT_RECORDS).map(([key, value]) => `${key}=${value}`),
  },
  {
    name: HOSTNAME,
    type: "A",
    flush: true,
    ttl: IP_TTL_SECONDS,
    data: REMOTE_IP_ADDRESS,
  },
  {
    name: HOSTNAME,
    type: "AAAA",
    flush: true,
    ttl: IP_TTL_SECONDS,
    data: REMOTE_IP_ADDRESS_V6,
  },
] as const;

// --- Respond to specific queries ---
mdns.on("query", (query) => {
  // Iterate over the questions in the query
  for (const question of query.questions) {
    // Respond if the query is for any of our records
    if (
      (question.type === "A" && question.name === HOSTNAME) ||
      (question.type === "AAAA" && question.name === HOSTNAME) ||
      (question.type === "SRV" && question.name === INSTANCE_NAME) ||
      (question.type === "TXT" && question.name === INSTANCE_NAME) ||
      (question.type === "PTR" && question.name === SERVICE_TYPE_NAME)
    ) {
      console.log(`Received query for ${question.name}, responding...`);
      // Respond with all records; this is efficient.
      mdns.respond({ answers: records });
    }
  }
});

// --- Announce the service proactively on startup ---
function announce() {
  console.log(
    `Announcing service "${SERVICE_NAME}" (${HOSTNAME}) to the network...`
  );
  // The 'respond' function with 'answers' also works for announcements.
  // It sends an unsolicited multicast response.
  mdns.respond({ answers: records }, (err) => {
    if (err) {
      console.error("Error announcing service:", err);
    } else {
      console.log("Service announced successfully.");
    }
  });
}

// Announce right away

announce();

// Optionally, re-announce periodically as per mDNS specs, though the library might handle this.
// For robustness, you can announce every so often.
// setInterval(announce, IP_TTL_SECONDS * 1000 * 0.8); // Re-announce at 80% of TTL

console.log("mDNS remote advertiser started and initial announcement sent.");
console.log(`Advertising service "${SERVICE_NAME}" pointing to ${HOSTNAME}`);
console.log(`Which in turn points to remote IP: ${REMOTE_IP_ADDRESS}`);
