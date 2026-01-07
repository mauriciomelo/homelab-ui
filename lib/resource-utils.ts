export const MEMORY_STEPS = [
  '0Mi',
  '64Mi',
  '128Mi',
  '256Mi',
  '512Mi',
  '1Gi',
  '2Gi',
  '4Gi',
  '8Gi',
  '16Gi',
  '32Gi',
] as const;
export const CPU_STEPS = [
  '0',
  '100m',
  '250m',
  '500m',
  '1',
  '2',
  '4',
  '8',
] as const;

export const MEMORY_UNITS = ['Ki', 'Mi', 'Gi'] as const;
export const CPU_UNITS = ['m', ''] as const;

export type MemoryUnit = (typeof MEMORY_UNITS)[number];
export type CpuUnit = (typeof CPU_UNITS)[number];
export type ResourceType = 'memory' | 'cpu';

type ResourceValue = {
  amount: number;
  type: ResourceType;
  unit: MemoryUnit | CpuUnit;
};

export function isUnitValid<T extends readonly string[]>(
  unit: string,
  units: T,
): unit is T[number] {
  return units.includes(unit);
}

export function extractAmountAndUnit(value: string) {
  const match = value.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return { amount: 0, unit: '' };

  const amount = Number.parseFloat(match[1]);
  const unit = match[2];

  return { amount, unit };
}

export function parseResourceValue(
  value: string | undefined,
  type: ResourceType,
) {
  const units = type === 'memory' ? MEMORY_UNITS : CPU_UNITS;

  if (value) {
    const parsed = extractAmountAndUnit(value);
    if (parsed && isUnitValid(parsed.unit, units)) {
      return { amount: parsed.amount, unit: parsed.unit, type };
    }
  }

  return { amount: 0, unit: units[0], type };
}

export function formatValue(value: ResourceValue) {
  if (value.type === 'cpu' && value.unit === '') {
    return `${value.amount} cores`;
  }

  return `${value.amount}${value.unit}`;
}

export function toBaseUnit(
  value: ResourceValue,
  units: readonly (MemoryUnit | CpuUnit)[],
  base: number,
): number {
  const unitIndex = units.indexOf(value.unit);
  return value.amount * Math.pow(base, unitIndex);
}
