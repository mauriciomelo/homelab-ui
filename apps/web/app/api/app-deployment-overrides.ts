import jsonPatch, { type Operation } from 'fast-json-patch';

import {
  type DeploymentJsonPatchSchema,
  deploymentJsonPatchOperationSchema,
  deploymentSchema,
} from './schemas';
import { z } from 'zod';

type DeploymentManifest = z.infer<typeof deploymentSchema>;

export function applyDeploymentJsonPatches({
  deployment,
  patches,
}: {
  deployment: DeploymentManifest;
  patches: DeploymentJsonPatchSchema[] | undefined;
}) {
  if (!patches || patches.length === 0) {
    return deployment;
  }

  const operations: Operation[] = z
    .array(deploymentJsonPatchOperationSchema)
    .parse(patches);

  const nextDeployment = structuredClone(deployment);
  const result = jsonPatch.applyPatch(
    nextDeployment,
    operations,
    true,
    true,
    true,
  );

  return deploymentSchema.parse(result.newDocument);
}
