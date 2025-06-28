import "server-only";
import * as k8s from "@kubernetes/client-node";
import * as _ from "lodash";
import { DEVICE_STATUS } from "./schemas";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

export async function devices() {
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

    return {
      name: node.metadata?.name,
      isMaster,
      status,
      ip: node.status?.addresses?.find((addr) => addr.type === "InternalIP")
        ?.address,
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
