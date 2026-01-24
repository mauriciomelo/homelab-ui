import * as z from 'zod';

export const authClientSchema = z.object({
  apiVersion: z.literal('tesselar.io/v1'),
  kind: z.literal('AuthClient'),
  metadata: z.object({
    name: z.string().min(1, 'AuthClient name is required'),
  }),
  spec: z.object({
    redirectUris: z
      .array(z.string().min(1, 'Redirect URI is required'))
      .min(1, 'At least one redirect URI is required'),
    postLogoutRedirectUris: z
      .array(z.string().min(1, 'Post logout redirect URI is required'))
      .min(1, 'At least one post logout redirect URI is required')
      .optional(),
  }),
});
