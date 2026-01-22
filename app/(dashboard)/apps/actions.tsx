'use server';

import { appSchema } from '@/app/api/schemas';
import * as apps from '@/app/api/applications';

export async function updateApp(data: unknown) {
  const app = appSchema.parse(data);
  await apps.updateApp(app);
  return { success: true };
}

export async function createApp(data: unknown) {
  const app = appSchema.parse(data);
  await apps.createApp(app);
  return { success: true };
}
