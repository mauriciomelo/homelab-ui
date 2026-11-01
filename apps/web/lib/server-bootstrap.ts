import { getOptionalConfig } from '@/app/(dashboard)/apps/config';
import { registerAuthClientController } from '@/app/api/auth-controller';
import { registerAppController } from '@/app/api/app-controller';
import { publishService } from '@/mdns';

let bootstrapped = false;
let bootstrapPromise: Promise<void> | undefined;

export async function ensureServerBootstrap() {
  bootstrapPromise ??= bootstrapServer();
  await bootstrapPromise;
}

export function isServerReady() {
  return bootstrapped;
}

async function bootstrapServer() {
  if (getOptionalConfig().PUBLISH_MDNS_SERVICE) {
    publishService();
  }

  await registerAppController();
  await registerAuthClientController();
  bootstrapped = true;
}
