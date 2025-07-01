import "server-only";
import * as _ from "lodash";
import { DEVICE_STATUS } from "./schemas";
import crypto from "crypto";
import assert from "assert";
import * as k8s from "./k8s";

export async function devices() {
  const coreApi = k8s.coreApi();
  const nodes = await coreApi.listNode();

  return nodes.items.map((node) => {
    const readyStatus =
      node?.status?.conditions?.find((condition) => condition.type === "Ready")
        ?.status || "Unknown";

    const status = nodeStatus(readyStatus);

    const isMaster =
      node.metadata?.labels?.["node-role.kubernetes.io/control-plane"] ===
        "true" &&
      node.metadata?.labels?.["node-role.kubernetes.io/master"] === "true";

    const ip = node.status?.addresses?.find(
      (addr) => addr.type === "InternalIP"
    )?.address;
    const name = node.metadata?.name;

    assert(typeof ip === "string", "IP should should be a string");
    assert(typeof name === "string", "Name should be a string");

    return {
      name,
      isMaster,
      status,
      ip,
    };
  });
}

function nodeStatus(status: string) {
  if (status === "True") {
    return DEVICE_STATUS.HEALTHY;
  }

  if (status === "False") {
    return DEVICE_STATUS.UNHEALTHY;
  }

  return DEVICE_STATUS.OFFLINE;
}

export async function createBootstrapToken() {
  const tokenId = crypto.randomBytes(3).toString("hex");
  const tokenSecret = crypto.randomBytes(8).toString("hex");

  // Token expires in 10 minutes
  const expiration = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const secret = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: `bootstrap-token-${tokenId}`,
      namespace: "kube-system",
    },
    type: "bootstrap.kubernetes.io/token",
    stringData: {
      "token-id": tokenId,
      "token-secret": tokenSecret,
      "usage-bootstrap-signing": "true",
      "usage-bootstrap-authentication": "true",
      expiration: expiration,
      "auth-extra-groups": "system:bootstrappers:k3s:default-node-token",
      description: "homelab-ui generated bootstrap token",
    },
  };
  const coreApi = k8s.coreApi();

  await coreApi.createNamespacedSecret({
    namespace: "kube-system",
    body: secret,
  });

  const cm = await coreApi.readNamespacedConfigMap({
    namespace: "kube-system",
    name: "kube-root-ca.crt",
  });

  const caCrt = cm.data?.["ca.crt"];

  if (!caCrt) {
    throw new Error("ca.crt not found in kube-root-ca.crt ConfigMap");
  }

  const shasum = crypto.createHash("sha256");
  shasum.update(caCrt);
  const caCertHash = shasum.digest("hex");
  const formatPrefix = "K10";
  const joinToken = `${formatPrefix}${caCertHash}::${tokenId}.${tokenSecret}`;

  return {
    tokenId,
    tokenSecret,
    caCertHash,
    joinToken,
  };
}

export async function resetDevice(nodeName: string) {
  try {
    const coreApi = k8s.coreApi();
    await coreApi.deleteNode({ name: nodeName });
  } catch (error) {
    if (_.get(error, "code") === 404) {
      return;
    }

    throw new Error(`Failed to delete node ${nodeName}: ${error}`);
  }
}
