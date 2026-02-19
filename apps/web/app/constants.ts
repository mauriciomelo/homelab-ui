export const APP_STATUS = {
  RUNNING: 'Running',
  PENDING: 'Pending',
  UNKNOWN: 'Unknown',
} as const;

export type AppStatus = (typeof APP_STATUS)[keyof typeof APP_STATUS];

export const DEVICE_STATUS = {
  HEALTHY: 'Healthy',
  UNHEALTHY: 'Unhealthy',
  OFFLINE: 'Offline',
  NEW: 'New',
} as const;

export type DeviceStatus = (typeof DEVICE_STATUS)[keyof typeof DEVICE_STATUS];
