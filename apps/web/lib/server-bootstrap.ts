import { getOptionalConfig } from '@/app/(dashboard)/apps/config';
import { registerAuthClientController } from '@/app/api/auth-controller';
import { registerAppController } from '@/app/api/app-controller';

let bootstrapped = false;

export async function ensureServerBootstrap() {
  if (bootstrapped) {
    return;
  }

  bootstrapped = true;

  const { publishService } = await import('@/mdns');

  if (getOptionalConfig().PUBLISH_MDNS_SERVICE) {
    publishService();
  }

  await registerAppController();
  await registerAuthClientController();
}
