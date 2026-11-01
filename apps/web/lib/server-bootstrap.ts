import { getOptionalConfig } from '@/app/(dashboard)/apps/config';
import {
  registerAuthClientController,
  stopAuthClientController,
} from '@/app/api/auth-controller';
import {
  registerAppController,
  stopAppController,
} from '@/app/api/app-controller';
import { publishService } from '@/mdns';

let bootstrapped = false;
let bootstrapPromise: Promise<void> | undefined;
let shutdownRegistered = false;

export async function ensureServerBootstrap() {
  bootstrapPromise ??= bootstrapServer();
  await bootstrapPromise;
}

export function isServerReady() {
  return bootstrapped;
}

export function shutdownServer() {
  bootstrapped = false;
  bootstrapPromise = undefined;
  unregisterShutdownHandlers();
  stopAppController();
  stopAuthClientController();
}

function registerShutdownHandlers() {
  if (shutdownRegistered) {
    return;
  }

  shutdownRegistered = true;
  process.on('SIGINT', shutdownServer);
  process.on('SIGTERM', shutdownServer);
}

function unregisterShutdownHandlers() {
  if (!shutdownRegistered) {
    return;
  }

  shutdownRegistered = false;
  process.off('SIGINT', shutdownServer);
  process.off('SIGTERM', shutdownServer);
}

async function bootstrapServer() {
  registerShutdownHandlers();

  if (getOptionalConfig().PUBLISH_MDNS_SERVICE) {
    publishService();
  }

  try {
    await registerAppController();
    await registerAuthClientController();
    bootstrapped = true;
  } catch (error) {
    stopAppController();
    stopAuthClientController();
    unregisterShutdownHandlers();
    throw error;
  }
}
