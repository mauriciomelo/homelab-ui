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
import {
  parseResourceValue,
  toBaseUnit,
  type ResourceFieldConfig,
} from '@/lib/resource-utils';

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
  config: ResourceFieldConfig;
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
  config,
}: ResourceFieldProps) {
  const resource = parseResourceValue(value, config.units);
  const [showSlider, setShowSlider] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const { base, steps, units, unitLabel } = config;
  const formatSliderValue =
    config.formatSliderValue ??
    ((currentValue) => `${currentValue.amount}${currentValue.unit}`);

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
    const currentValueInBase = toBaseUnit(resource, units, base);
    const differences = steps.map((step) => {
      const stepValue = parseResourceValue(step, units);
      const stepInBase = toBaseUnit(stepValue, units, base);
      return Math.abs(stepInBase - currentValueInBase);
    });
    const minDifference = Math.min(...differences);
    return differences.indexOf(minDifference);
  };

  const handleSliderChange = ([stepIndex]: number[]) => {
    onChange?.(steps[stepIndex]);
  };

  const maxSliderLabel = () => {
    const maxStep = steps[steps.length - 1];
    const stepValue = parseResourceValue(maxStep, units);
    return formatSliderValue(stepValue);
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
              <SelectTrigger
                aria-label={unitLabel}
                className="w-[85px] rounded-l-none border-0 shadow-none focus:ring-0 focus:ring-offset-0"
              >
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
              <span
                aria-label="current-value"
                className="font-medium tabular-nums"
              >
                {formatSliderValue(resource)}
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
              <span aria-label="min-value">0</span>
              <span aria-label="max-value">{maxSliderLabel()}</span>
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
