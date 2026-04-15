import { describe, expect, test } from 'vitest';
import * as z from 'zod/v4';

import { toKubernetesJsonSchema } from './kubernetes-schema-compatibility';

describe('toKubernetesJsonSchema', () => {
  test('rejects schemas with $ref', () => {
    const recursiveSchema: z.ZodType<unknown> = z.lazy(() =>
      z.object({
        children: z.array(recursiveSchema),
      }),
    );

    expect(() => toKubernetesJsonSchema(recursiveSchema)).toThrow(
      'Kubernetes CRD OpenAPI schemas reject $ref',
    );
  });

  test('rejects array items that only define structure inside oneOf branches', () => {
    // This is the smallest shape that still reproduces the CRD structural-schema
    // problem: an array of discriminated union objects. Zod emits the item schema
    // with oneOf branches, and each branch defines its own object structure.
    // Kubernetes requires array items to declare a top-level structural type
    // instead of only defining the shape inside oneOf.
    const itemSchema = z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('text').meta({ description: 'Text item kind' }),
        value: z.string().meta({ description: 'Text item value' }),
      }),
      z.object({
        kind: z.literal('count').meta({ description: 'Count item kind' }),
        value: z.number().meta({ description: 'Count item value' }),
      }),
    ]);

    const schema = z.object({
      items: z.array(itemSchema),
    });

    expect(() => toKubernetesJsonSchema(schema)).toThrow(
      'Kubernetes CRD OpenAPI array items must declare a top-level type',
    );
  });
});
