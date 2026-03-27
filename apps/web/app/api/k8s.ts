import * as k8s from '@kubernetes/client-node';

export function coreApi() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc.makeApiClient(k8s.CoreV1Api);
}

export function apiextensionsV1Api() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc.makeApiClient(k8s.ApiextensionsV1Api);
}

export function customObjectsApi() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc.makeApiClient(k8s.CustomObjectsApi);
}

export function appsApi() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc.makeApiClient(k8s.AppsV1Api);
}

export function networkingApi() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return kc.makeApiClient(k8s.NetworkingV1Api);
}

export function createWatch() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return new k8s.Watch(kc);
}
