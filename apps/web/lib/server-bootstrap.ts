import {
  registerAuthClientController,
  stopAuthClientController,
} from '@/app/api/auth-controller';
import {
  registerAppController,
  stopAppController,
} from '@/app/api/app-controller';
import { stopMdns } from '@/mdns';

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
  stopMdns();
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

  try {
    await registerAppController();
    await registerAuthClientController();
    bootstrapped = true;
  } catch (error) {
    stopAppController();
    stopAuthClientController();
    stopMdns();
    unregisterShutdownHandlers();
    throw error;
  }
}
