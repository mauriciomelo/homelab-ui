import { z } from 'zod';

export type JsonValue = unknown;

export const jsonValueSchema: z.ZodType<unknown> = z
  .unknown()
  .refine(isJsonValue, 'Value must be valid JSON')
  .meta({ 'x-kubernetes-preserve-unknown-fields': true });

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
