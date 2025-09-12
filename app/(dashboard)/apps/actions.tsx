'use server';

import { appFormSchema } from './formSchema';
import * as apps from '@/app/api/applications';

export async function updateApp(data: unknown) {
  const app = appFormSchema.parse(data);
  await apps.updateApp(app);
  return { success: true };
}
