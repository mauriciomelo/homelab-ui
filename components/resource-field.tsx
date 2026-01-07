'use client';

import * as React from 'react';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const MEMORY_STEPS = [
  0, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768,
];
const CPU_STEPS = [0, 100, 250, 500, 1000, 2000, 4000, 8000];

const MEMORY_UNITS = ['Ki', 'Mi', 'Gi'] as const;
const CPU_UNITS = ['m', ''] as const;

export type MemoryUnit = (typeof MEMORY_UNITS)[number];
export type CpuUnit = (typeof CPU_UNITS)[number];
type ResourceType = 'memory' | 'cpu';

function isUnitValid<T extends readonly string[]>(
  unit: string,
  units: T,
): unit is T[number] {
  return units.includes(unit);
}

function getUnitIndex(
  unit: MemoryUnit | CpuUnit,
  units: readonly string[],
): number {
  return units.indexOf(unit as string);
}

function getUnitFactor(
  unit: MemoryUnit | CpuUnit,
  units: readonly string[],
  base: number,
): number {
  return Math.pow(base, getUnitIndex(unit, units));
}

function convertValue(
  value: number,
  fromUnit: MemoryUnit | CpuUnit,
  toUnit: MemoryUnit | CpuUnit,
  units: readonly string[],
  base: number,
): number {
  const baseValue = value * getUnitFactor(fromUnit, units, base);
  return baseValue / getUnitFactor(toUnit, units, base);
}

function getBestUnit(
  valueInBaseUnit: number,
  units: readonly string[],
  base: number,
) {
  if (valueInBaseUnit <= 0)
    return {
      amount: 0,

      unit: units[0],
    };
  const unitIndex = Math.min(
    Math.floor(Math.log(valueInBaseUnit) / Math.log(base)),
    units.length - 1,
  );

  const convertedValue = valueInBaseUnit / Math.pow(base, unitIndex);
  const rounded = Math.round(convertedValue * 100) / 100;
  return {
    amount: rounded,
    unit: units[unitIndex],
  };
}

function parseResourceValue(value: string | undefined, type: ResourceType) {
  const units = type === 'memory' ? MEMORY_UNITS : CPU_UNITS;

  if (value) {
    const match = value.match(/^(\d+(?:\.\d+)?)(.*)$/);
    if (match) {
      const amount = Number.parseFloat(match[1]);
      const unitCandidate = match[2];

      if (isUnitValid(unitCandidate, units)) {
        return { amount, unit: unitCandidate };
      }
    }
  }

  // If parsing fails or unit is invalid, return default values based on type
  return { amount: 0, unit: units[0] };
}

interface ResourceFieldProps {
  id?: string;
  label?: string;
  description?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  dataTestId?: string;
  type?: ResourceType;
}

export function ResourceField({
  id,
  label,
  description,
  error,
  value,
  onChange,
  placeholder = '0',
  disabled = false,
  required = false,
  className,
  dataTestId,
  type = 'memory',
}: ResourceFieldProps) {
  const resource = parseResourceValue(value, type);
  const [showSlider, setShowSlider] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const base = type === 'memory' ? 1024 : 1000;
  const steps = type === 'memory' ? MEMORY_STEPS : CPU_STEPS;
  const units = type === 'memory' ? MEMORY_UNITS : CPU_UNITS;
  const baseUnit = type === 'memory' ? 'Mi' : 'm';

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue === '' || /^\d*\.?\d*$/.test(newValue)) {
      onChange?.(`${newValue}${resource.unit}`);
    }
  };

  const handleUnitChange = (newUnit: string) => {
    const unit = newUnit === 'cores' ? '' : newUnit;
    onChange?.(`${resource.amount}${unit}`);
  };

  const getSliderValue = () => {
    const valueInBase = convertValue(
      resource.amount || 0,
      resource.unit,
      baseUnit,
      units,
      base,
    );
    const differences = steps.map((step) => Math.abs(step - valueInBase));
    const minDifference = Math.min(...differences);
    return differences.indexOf(minDifference);
  };

  const handleSliderChange = ([stepIndex]: number[]) => {
    const stepValue = steps[stepIndex];
    const valueInKi =
      type === 'memory'
        ? stepValue * getUnitFactor('Mi', units, base)
        : stepValue;

    const { amount, unit } = getBestUnit(valueInKi, units, base);

    onChange?.(`${amount}${unit}`);
  };

  const maxSliderLabel = () => {
    if (type === 'memory') return '32 Gi';
    const maxCpu = CPU_STEPS[CPU_STEPS.length - 1];
    return maxCpu < 1000 ? `${maxCpu}m` : `${maxCpu / 1000}`;
  };

  return (
    <Field className={className} data-invalid={!!error}>
      {label && (
        <FieldLabel htmlFor={id}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </FieldLabel>
      )}
      <Popover open={showSlider && !disabled} onOpenChange={setShowSlider}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              'bg-background flex items-center rounded-md border transition-colors',
              isFocused &&
                'ring-ring ring-offset-background ring-2 ring-offset-2',
              error && 'border-destructive',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Input
              ref={inputRef}
              id={id}
              inputMode="numeric"
              value={resource.amount}
              onChange={handleValueChange}
              onFocus={() => {
                setShowSlider(true);
                setIsFocused(true);
              }}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={disabled}
              required={required}
              aria-invalid={!!error}
              className="flex-1 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              data-testid={dataTestId}
            />
            <div className="bg-border h-6 w-px" />
            <Select
              value={resource.unit === '' ? 'cores' : resource.unit.toString()}
              onValueChange={handleUnitChange}
              disabled={disabled}
            >
              <SelectTrigger className="w-[85px] rounded-l-none border-0 shadow-none focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((unitOption) => (
                  <SelectItem
                    key={unitOption.toString()}
                    value={
                      unitOption.toString() === ''
                        ? 'cores'
                        : unitOption.toString()
                    }
                  >
                    {unitOption.toString() || 'cores'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-80 p-4"
          align="start"
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === inputRef.current) {
              e.preventDefault();
            }
          }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Quick adjust</span>
              <span className="font-medium tabular-nums">
                {resource.amount ?? 0} {resource.unit.toString() || 'cores'}
              </span>
            </div>
            <Slider
              value={[getSliderValue()]}
              onValueChange={handleSliderChange}
              min={0}
              max={steps.length - 1}
              step={1}
              className="w-full"
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>0</span>
              <span>{maxSliderLabel()}</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {description && !error && (
        <FieldDescription>{description}</FieldDescription>
      )}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
