import * as z from 'zod';

export const authClientSchema = z
  .object({
    apiVersion: z.literal('tesselar.io/v1'),
    kind: z.literal('AuthClient'),
    metadata: z.object({
      name: z.string().min(1, 'AuthClient name is required'),
    }),
    spec: z.object({
      redirectUris: z
        .array(
          z
            .string()
            .min(1, 'Redirect URI is required')
            .url('Redirect URI must be a valid URL'),
        )
        .min(1, 'At least one redirect URI is required')
        .meta({
          description:
            'Allowed redirect URIs for the AuthClient (example: "https://app.example.com/callback")',
        }),
      postLogoutRedirectUris: z
        .array(
          z
            .string()
            .min(1, 'Post logout redirect URI is required')
            .url('Post logout redirect URI must be a valid URL'),
        )
        .min(1, 'At least one post logout redirect URI is required')
        .optional()
        .meta({
          description:
            'Optional post-logout redirect URIs (example: "https://app.example.com/")',
        }),
    }),
  })
  .meta({
    title: 'AuthClient',
    description:
      'AuthClient resource (example: "sso"); applying this creates a Secret named sso with keys "client-id" and "client-secret" for env var references',
  });

export type AuthClientSchema = z.infer<typeof authClientSchema>;
