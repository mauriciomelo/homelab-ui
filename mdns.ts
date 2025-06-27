// advertise.js
import multicastDns from "multicast-dns";

const DOMAIN_TO_ADVERTISE = "podinfo2.home.mauriciomelo.local";
const TARGET_IP_ADDRESS = "192.168.0.77";
const IP_TTL_SECONDS = 120; // Time-to-live for the record (e.g., 120 seconds)
const SERVICE_TYPE = "_http._tcp";
const SERVICE_NAME = "podinfo2 home"; // The human-readable name
const SERVICE_PORT = 80; // The port your service is running on

// --- Protocol Names (auto-generated) ---
const SERVICE_TYPE_NAME = `${SERVICE_TYPE}.local`; // e.g., '_http._tcp.local'
const INSTANCE_NAME = `${SERVICE_NAME}.${SERVICE_TYPE_NAME}`; // e.g., 'My Awesome Web Server._http._tcp.local'

// Optional: Add extra metadata for the service
const TXT_RECORDS = {
  author: "Mauricio",
};

console.log("Initializing mDNS advertiser...");

const mdns = multicastDns();

// This is the core logic: listen for queries from other devices
mdns.on("query", (query, rinfo) => {
  // rinfo contains the address and port of the device that sent the query

  const askedDomain = query.questions
    .map((q) => `${q.name} (${q.type})`)
    .join(", ");

  if (askedDomain.includes(DOMAIN_TO_ADVERTISE)) {
    console.log(
      `Received query from ${rinfo.address}:${rinfo.port} for:`,
      query.questions.map((q) => `${q.name} (${q.type})`).join(", ")
    );
  }

  for (const question of query.questions) {
    if (question.type === "PTR" && question.name === SERVICE_TYPE_NAME) {
      console.log(`Responding to PTR query for ${SERVICE_TYPE_NAME}`);
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

    // 2. Someone is asking for details about our specific service instance
    // We respond with SRV (port/target) and TXT (metadata) records.
    if (question.type === "SRV" && question.name === INSTANCE_NAME) {
      console.log(
        `Responding to SRV/ANY query for our instance ${INSTANCE_NAME}`
      );
      mdns.respond({
        answers: [
          {
            name: INSTANCE_NAME,
            type: "SRV",
            ttl: IP_TTL_SECONDS,
            data: {
              port: SERVICE_PORT,
              target: DOMAIN_TO_ADVERTISE, // The target hostname
            },
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
  }

  // We need to check if any question matches what we want to advertise
  const askedForOurDomain = query.questions.some((question) => {
    // We will respond if someone asks for our domain with type 'A' (IPv4) or 'ANY'
    return question.name === DOMAIN_TO_ADVERTISE && question.type === "A";
  });

  if (askedForOurDomain) {
    console.log(
      `Query matches our domain. Responding with IP: ${TARGET_IP_ADDRESS}`
    );

    // Craft and send a response packet
    mdns.respond({
      answers: [
        {
          name: DOMAIN_TO_ADVERTISE,
          type: "A", // 'A' record for an IPv4 address
          ttl: IP_TTL_SECONDS,
          data: TARGET_IP_ADDRESS,
        },
      ],
    });
  }
});

console.log(
  `mDNS advertiser started. Listening for queries for "${DOMAIN_TO_ADVERTISE}"...`
);
console.log("Keep this script running to continue advertising.");
