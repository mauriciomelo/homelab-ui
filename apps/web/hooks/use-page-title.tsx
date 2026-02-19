import _ from 'lodash';
import { Home, PencilRuler, Server, Settings } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';

const defaultPageInfo = { title: '', icon: null };

export const pathMap = {
  '/': {
    title: 'Dashboard',
    icon: Home,
  },
  '/apps': {
    title: 'Apps',
    icon: PencilRuler,
  },
  '/devices': {
    title: 'Devices',
    icon: Server,
  },
  '/settings': {
    title: 'Settings',
    icon: Settings,
  },
} as const;

export function usePageInfo() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const page = _.get(pathMap, pathname, defaultPageInfo);

  return { ...page, pathname };
}
