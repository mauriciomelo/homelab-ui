import { getOptionalConfig } from '@/app/(dashboard)/apps/config';
import { registerAuthClientController } from '@/app/api/auth-controller';

let bootstrapped = false;

export async function ensureServerBootstrap() {
  if (bootstrapped) {
    return;
  }

  bootstrapped = true;

  if (getOptionalConfig().PUBLISH_MDNS_SERVICE) {
    const { publishService } = await import('@/mdns');
    publishService();
  }

  await registerAuthClientController();
}
