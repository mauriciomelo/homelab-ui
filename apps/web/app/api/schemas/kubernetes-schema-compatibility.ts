import { V1JSONSchemaProps } from '@kubernetes/client-node';
import * as z from 'zod/v4';

export function toKubernetesJsonSchema(
  schema: z.core.$ZodType,
): V1JSONSchemaProps {
  const jsonSchema: V1JSONSchemaProps = JSON.parse(
    JSON.stringify(z.toJSONSchema(schema, { io: 'input' })),
  );

  assertKubernetesSchemaCompatibility(jsonSchema);

  return jsonSchema;
}

export function assertKubernetesSchemaCompatibility(jsonSchema: unknown) {
  if (containsRef(jsonSchema)) {
    throw new Error(
      'Kubernetes CRD OpenAPI schemas reject $ref, including recursive refs emitted by z.toJSONSchema.',
    );
  }

  if (containsNonStructuralArrayItemSchema(jsonSchema)) {
    throw new Error(
      'Kubernetes CRD OpenAPI array items must declare a top-level type instead of only defining structure inside oneOf branches.',
    );
  }
}

function containsRef(value: unknown): boolean {
  if (!isRecord(value)) {
    if (!Array.isArray(value)) {
      return false;
    }

    return value.some(containsRef);
  }

  if ('$ref' in value) {
    return true;
  }

  return Object.values(value).some(containsRef);
}

function containsNonStructuralArrayItemSchema(value: unknown): boolean {
  if (!isRecord(value)) {
    if (!Array.isArray(value)) {
      return false;
    }

    return value.some(containsNonStructuralArrayItemSchema);
  }

  const items = value.items;

  if (isRecord(items) && Array.isArray(items.oneOf) && items.type !== 'object') {
    return true;
  }

  return Object.values(value).some(containsNonStructuralArrayItemSchema);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
