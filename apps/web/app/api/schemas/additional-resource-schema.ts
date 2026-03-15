import { z } from 'zod';
import { authClientSchema } from './auth-client-schema';
import { persistentVolumeClaimSchema } from './persistent-volume-claim-schema';

export const additionalResourceSchema = z.union([
  authClientSchema,
  persistentVolumeClaimSchema,
]);

export type AdditionalResourceSchema = z.infer<typeof additionalResourceSchema>;

export function deriveResourceReferences(resources: AdditionalResourceSchema[]) {
  return resources.flatMap((resource) => {
    if (resource.kind !== 'AuthClient') {
      return [];
    }

    return [
      {
        name: resource.metadata.name,
        kind: resource.kind,
        keys: ['client-id', 'client-secret'] as const,
      },
    ];
  });
}
