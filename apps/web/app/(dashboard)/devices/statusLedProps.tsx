'use client';
import { DeviceStatus, DEVICE_STATUS } from '@/app/constants';
import { Status } from '@/components/ui/status';
import { ComponentProps } from 'react';

export function statusLedProps(
  status: DeviceStatus,
): ComponentProps<typeof Status> {
  if (status === DEVICE_STATUS.HEALTHY) {
    return {
      color: 'green',
      animate: false,
    };
  }

  if (status === DEVICE_STATUS.UNHEALTHY) {
    return {
      color: 'red',
      animate: true,
    };
  }
  if (status === DEVICE_STATUS.NEW) {
    return {
      color: 'blue',
      animate: true,
    };
  }

  return {
    color: 'gray',
    animate: false,
  };
}
