import { z } from 'zod';

/**
 * Parse K8s CPU string to millicores number
 * Examples: "500m" -> 500, "1" -> 1000, "2.5" -> 2500
 */
export function parseCpu(cpu: string | number): number {
  if (typeof cpu === 'number') return cpu;
  if (cpu.endsWith('m')) {
    return parseInt(cpu.replace('m', ''), 10);
  }
  return parseFloat(cpu) * 1000;
}

/**
 * Format millicores number to K8s CPU string
 * Examples: 500 -> "500m", 1000 -> "1000m"
 */
export function formatCpu(millicores: number): string {
  return `${millicores}m`;
}

/**
 * Parse K8s memory string to MiB number
 * Examples: "512Mi" -> 512, "1Gi" -> 1024, "2Gi" -> 2048
 */
export function parseMemory(memory: string | number): number {
  if (typeof memory === 'number') return memory;
  if (memory.endsWith('Gi')) {
    return parseFloat(memory.replace('Gi', '')) * 1024;
  }
  if (memory.endsWith('Mi')) {
    return parseInt(memory.replace('Mi', ''), 10);
  }
  if (memory.endsWith('Ki')) {
    return Math.round(parseInt(memory.replace('Ki', ''), 10) / 1024);
  }
  // Assume bytes, convert to MiB
  return Math.round(parseInt(memory, 10) / (1024 * 1024));
}

/**
 * Format MiB number to K8s memory string
 * Uses Mi for values under 1024, Gi for larger values
 */
export function formatMemory(mib: number): string {
  if (mib >= 1024 && mib % 1024 === 0) {
    return `${mib / 1024}Gi`;
  }
  return `${mib}Mi`;
}

/**
 * Parse K8s resource object with string values to numeric values.
 * The form works with numbers internally.
 */
export function parseK8sResources(resource: {
  limits: { cpu: string; memory: string };
}): { limits: { cpu: number; memory: number } } {
  return {
    limits: {
      cpu: parseCpu(resource.limits.cpu),
      memory: parseMemory(resource.limits.memory),
    },
  };
}

/**
 * Format numeric resource values back to K8s format.
 */
export function formatK8sResources(resource: {
  limits: { cpu: number; memory: number };
}): { limits: { cpu: string; memory: string } } {
  return {
    limits: {
      cpu: formatCpu(resource.limits.cpu),
      memory: formatMemory(resource.limits.memory),
    },
  };
}

export const appFormSchema = z.object({
  name: z.string().min(1, 'App name is required'),
  image: z.string().min(1, 'App image is required'),
  envVariables: z.array(
    z.object({
      name: z.string().min(1).min(1, 'Variable name is required'),
      value: z.string().min(1, 'Variable value is required'),
    }),
  ),
  resource: z.object({
    limits: z.object({
      cpu: z.string().min(1, 'CPU is required'),
      memory: z.string().min(1, 'Memory is required'),
    }),
  }),
});

export type AppFormSchema = z.infer<typeof appFormSchema>;
