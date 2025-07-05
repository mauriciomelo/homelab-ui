import "server-only";
import * as _ from "lodash";
import { DEVICE_STATUS } from "./schemas";
import crypto from "crypto";
import assert from "assert";
import * as k8s from "./k8s";
import { V1Eviction, V1Pod } from "@kubernetes/client-node";

export type ClusterNode = Awaited<ReturnType<typeof devices>>[number];

export async function devices() {
  const coreApi = k8s.coreApi();
  const nodes = await coreApi.listNode();
  return nodes.items.map((node) => {
    const readyStatus =
      node?.status?.conditions?.find((condition) => condition.type === "Ready")
        ?.status || "Unknown";

    const status = nodeStatus(readyStatus);

    const info = node.status?.nodeInfo;
    const nodeInfo = {
      architecture: info?.architecture === "amd64" ? "x64" : info?.architecture,
      operatingSystem: info?.operatingSystem,
      osImage: info?.osImage,
    };

    const capacity = node.status?.capacity;
    const allocable = node.status?.allocatable;

    const isMaster =
      node.metadata?.labels?.["node-role.kubernetes.io/control-plane"] ===
        "true" &&
      node.metadata?.labels?.["node-role.kubernetes.io/master"] === "true";

    const ip = node.status?.addresses?.find(
      (addr) => addr.type === "InternalIP",
    )?.address;
    const name = node.metadata?.name;

    assert(typeof ip === "string", "IP should should be a string");
    assert(typeof name === "string", "Name should be a string");

    return {
      name,
      isMaster,
      nodeInfo,
      capacity,
      allocable,
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

export async function deleteNode(nodeName: string) {
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

export async function drainNode(nodeName: string) {
  try {
    await cordonNode(nodeName);
    const pods = await getPodsForNode(nodeName);
    await evictPods(pods);
  } catch (error) {
    throw new Error(`Failed to drain node ${nodeName}: ${error}`);
  }
}

function cordonNode(nodeName: string) {
  const coreApi = k8s.coreApi();
  const patch = {
    op: "replace",
    path: "/spec/unschedulable",
    value: true,
  };

  return coreApi.patchNode({
    name: nodeName,
    body: [patch],
  });
}

export async function getPodsForNode(nodeName: string) {
  const coreApi = k8s.coreApi();
  const allPods = await coreApi.listPodForAllNamespaces({
    fieldSelector: `spec.nodeName=${nodeName}`,
    labelSelector: "app-type=user",
  });

  return allPods.items;
}

async function evictPods(pods: V1Pod[]) {
  const coreApi = k8s.coreApi();

  console.log(`Evicting pods for node: ${pods}`);

  for (const pod of pods) {
    if (!pod.metadata?.namespace || !pod.metadata.name) {
      console.warn(
        `Pod ${pod.metadata?.name} in namespace ${pod.metadata?.namespace} is missing metadata, skipping eviction.`,
        pod.metadata,
      );
      continue;
    }

    try {
      const eviction = {
        apiVersion: "policy/v1",
        kind: "Eviction",
        metadata: {
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
        },
      } satisfies V1Eviction;

      await coreApi.createNamespacedPodEviction({
        namespace: pod.metadata.namespace,
        name: pod.metadata.name,
        body: eviction,
      });
      console.log(`Evicting ${pod.metadata.namespace}/${pod.metadata.name}`);
    } catch (error) {
      console.warn(
        `Could not evict pod ${pod.metadata.namespace}/${pod.metadata.name}: ${error}`,
      );
    }
  }
}
