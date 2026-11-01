import { getOptionalConfig } from '@/app/(dashboard)/apps/config';
import { registerAuthClientController } from '@/app/api/auth-controller';
import { registerAppController } from '@/app/api/app-controller';
import { publishService } from '@/mdns';

let bootstrapped = false;

export async function ensureServerBootstrap() {
  if (bootstrapped) {
    return;
  }

  bootstrapped = true;

  if (getOptionalConfig().PUBLISH_MDNS_SERVICE) {
    publishService();
  }

  await registerAppController();
  await registerAuthClientController();
}
