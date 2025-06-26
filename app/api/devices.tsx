import "server-only";
import fs from "fs";
import YAML from "yaml";
import * as z from "zod";
import * as k8s from "@kubernetes/client-node";
import { getAppConfig } from "../(dashboard)/apps/config";
import path from "path";
import { AppFormSchema } from "../(dashboard)/apps/formSchema";
import * as _ from "lodash";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import {
  APP_STATUS,
  deploymentSchema,
  DEVICE_STATUS,
  ingressSchema,
  kustomizationSchema,
} from "./schemas";

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

    return {
      name: node.metadata?.name,
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
