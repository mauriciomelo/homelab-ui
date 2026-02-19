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
export type ResourceValue = {
  amount: number;
  unit: MemoryUnit | CpuUnit;
};

export type ResourceFieldConfig = {
  steps: ReadonlyArray<string>;
  units: ReadonlyArray<CpuUnit | MemoryUnit>;
  base: number;
  unitLabel: string;
  formatSliderValue?: (value: ResourceValue) => string;
};

export const cpuConfig = {
  steps: CPU_STEPS,
  units: CPU_UNITS,
  base: 1000,
  unitLabel: 'cpu unit',
  formatSliderValue: (value: ResourceValue) =>
    value.unit === ''
      ? `${value.amount} cores`
      : `${value.amount}${value.unit}`,
} satisfies ResourceFieldConfig;

export const memoryConfig = {
  steps: MEMORY_STEPS,
  units: MEMORY_UNITS,
  base: 1024,
  unitLabel: 'memory unit',
} satisfies ResourceFieldConfig;

export const storageConfig = {
  ...memoryConfig,
  unitLabel: 'storage unit',
} satisfies ResourceFieldConfig;

type SizeKey = 'small' | 'medium' | 'large';

export const resourceLimitPreset = {
  small: {
    limits: { cpu: '500m', memory: '512Mi' },
    label: '0.5 vCPU, 512Mi RAM',
  },
  medium: { limits: { cpu: '1', memory: '1Gi' }, label: '1 vCPU, 1Gi RAM' },
  large: { limits: { cpu: '2', memory: '2Gi' }, label: '2 vCPU, 2Gi RAM' },
} satisfies Record<
  SizeKey,
  {
    limits: { cpu: string; memory: string };
    label: string;
  }
>;

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
  units: ReadonlyArray<CpuUnit | MemoryUnit>,
) {
  if (value) {
    const parsed = extractAmountAndUnit(value);
    if (parsed && isUnitValid(parsed.unit, units)) {
      return { amount: parsed.amount, unit: parsed.unit };
    }
  }

  return { amount: 0, unit: units[0] };
}

export function toBaseUnit(
  value: ResourceValue,
  units: readonly (MemoryUnit | CpuUnit)[],
  base: number,
): number {
  const unitIndex = units.indexOf(value.unit);
  return value.amount * Math.pow(base, unitIndex);
}
