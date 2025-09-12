import { z } from 'zod';
export const appFormSchema = z.object({
  name: z.string().min(1, 'App name is required'),
  image: z.string().min(1, 'App image is required'),
  envVariables: z.array(
    z.object({
      name: z.string().min(1).min(1, 'Variable name is required'),
      value: z.string().min(1, 'Variable value is required'),
    }),
  ),
});

export type AppFormSchema = z.infer<typeof appFormSchema>;
