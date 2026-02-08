import { describe, expect } from 'vitest';
import { http } from 'msw';
import { produce } from 'immer';
import { page } from 'vitest/browser';
import { Devices } from './devices';
import { DEVICE_STATUS } from '@/app/constants';
import {
  test,
  renderWithProviders,
  userEvent,
  orpcJsonResponse,
} from '@/test-utils/browser';
import { baseApp } from '@/test-utils/fixtures';
import type { ClusterNode } from '@/app/api/devices';
import type { DiscoveredNode } from '@/mdns';

const baseClusterNode: ClusterNode = {
  name: 'control-node',
  isMaster: true,
  nodeInfo: {
    architecture: 'x64',
    operatingSystem: 'linux',
    osImage: 'Ubuntu 24.04',
  },
  capacity: {
    cpu: '8',
    memory: '16777216Ki',
    'ephemeral-storage': '104857600Ki',
  },
  allocable: {
    cpu: '8',
    memory: '16777216Ki',
    'ephemeral-storage': '104857600Ki',
  },
  status: DEVICE_STATUS.HEALTHY,
  ip: '192.168.1.20',
};

const baseDiscoveredNode: DiscoveredNode = {
  name: 'new-node',
  ip: '192.168.1.40',
  port: 3001,
  nodeInfo: {
    architecture: 'arm64',
    operatingSystem: 'linux',
    osImage: 'Debian 12',
  },
  capacity: {
    cpu: 4,
    memory: '8388608Ki',
  },
};

async function readOrpcInput(request: Request): Promise<unknown> {
  const body = await request.json();

  if (!isRecord(body) || !('json' in body)) {
    throw new Error('Expected oRPC payload with json field');
  }

  return body.json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mockDevicesQueries({
  clusterNodes,
  discoveredNodes,
  apps,
}: {
  clusterNodes: ClusterNode[];
  discoveredNodes: DiscoveredNode[];
  apps: (typeof baseApp)[];
}) {
  return [
    http.post('*/api/control-plane/rpc/devices/list', () => {
      return orpcJsonResponse(clusterNodes);
    }),
    http.post('*/api/control-plane/rpc/devices/discoveredNodes', () => {
      return orpcJsonResponse(discoveredNodes.map((node) => [node.ip, node]));
    }),
    http.post('*/api/control-plane/rpc/devices/apps', () => {
      return orpcJsonResponse(apps);
    }),
  ];
}

describe('Devices Page', () => {
  test('renders adopted and discovered devices in one table', async ({
    worker,
  }) => {
    const adoptedNode = produce(baseClusterNode, (draft) => {
      draft.name = 'alpha-node';
      draft.ip = '192.168.1.21';
      draft.status = DEVICE_STATUS.HEALTHY;
    });

    const discoveredNode = produce(baseDiscoveredNode, (draft) => {
      draft.name = 'beta-node';
      draft.ip = '192.168.1.41';
      draft.port = 4001;
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [adoptedNode],
        discoveredNodes: [discoveredNode],
        apps: [],
      }),
    );

    await renderWithProviders(<Devices />);

    await expect
      .poll(() => page.getByText('alpha-node').elements().length)
      .toBe(1);
    await expect
      .poll(() => page.getByText('beta-node').elements().length)
      .toBe(1);

    await expect.element(page.getByText('HEALTHY')).toBeInTheDocument();
    await expect
      .element(page.getByRole('button', { name: 'Adopt Device' }))
      .toBeInTheDocument();

    await expect.element(page.getByText('192.168.1.21')).toBeInTheDocument();
    await expect.element(page.getByText('192.168.1.41')).toBeInTheDocument();
  });

  test('opens node details sheet from table row and closes correctly', async ({
    worker,
  }) => {
    const user = userEvent.setup();

    const adoptedNode = produce(baseClusterNode, (draft) => {
      draft.name = 'alpha-node';
      draft.ip = '192.168.1.21';
      draft.status = DEVICE_STATUS.HEALTHY;
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [adoptedNode],
        discoveredNodes: [],
        apps: [],
      }),
    );

    await renderWithProviders(<Devices />);

    await user.click(page.getByRole('button', { name: 'alpha-node' }));

    await expect
      .poll(() => page.getByText('Device details').elements().length)
      .toBe(1);
    await expect
      .poll(() => page.getByText('Linux (Ubuntu 24.04)').elements().length)
      .toBe(1);

    await user.click(page.getByRole('button', { name: 'Close' }));

    await expect
      .poll(() => page.getByText('Device details').elements().length)
      .toBe(0);
  });

  test('adopts a new device and refreshes data state', async ({ worker }) => {
    const user = userEvent.setup();
    let adoptPayload: unknown;

    const discoveredNode = produce(baseDiscoveredNode, (draft) => {
      draft.name = 'beta-node';
      draft.ip = '192.168.1.41';
      draft.port = 4001;
    });

    let devicesRequestCount = 0;

    worker.use(
      http.post('*/api/control-plane/rpc/devices/list', () => {
        devicesRequestCount += 1;

        return orpcJsonResponse(
          devicesRequestCount === 1
            ? []
            : [
                {
                  ...baseClusterNode,
                  name: discoveredNode.name,
                  ip: discoveredNode.ip,
                  status: DEVICE_STATUS.HEALTHY,
                },
              ],
        );
      }),
      http.post('*/api/control-plane/rpc/devices/discoveredNodes', () => {
        return orpcJsonResponse(
          devicesRequestCount === 1
            ? [[discoveredNode.ip, discoveredNode]]
            : [],
        );
      }),
      http.post('*/api/control-plane/rpc/devices/apps', () => {
        return orpcJsonResponse([]);
      }),
      http.post(
        '*/api/control-plane/rpc/devices/adopt',
        async ({ request }) => {
          adoptPayload = await readOrpcInput(request);
          return orpcJsonResponse(null);
        },
      ),
    );

    await renderWithProviders(<Devices />);

    await expect
      .poll(() => page.getByRole('button', { name: 'Adopt Device' }).elements())
      .toHaveLength(1);

    await user.click(page.getByRole('button', { name: 'Adopt Device' }));

    await expect
      .poll(() => page.getByRole('button', { name: 'Adopt Device' }).elements())
      .toHaveLength(0);

    await expect
      .poll(() => page.getByText('HEALTHY').elements().length)
      .toBeGreaterThan(0);

    expect(adoptPayload).toEqual({
      name: 'beta-node',
      ip: '192.168.1.41',
      port: 4001,
    });
  });

  test('resets a non-master device via confirmation dialog', async ({
    worker,
  }) => {
    const user = userEvent.setup();
    let resetPayload: unknown;

    const nonMasterNode = produce(baseClusterNode, (draft) => {
      draft.name = 'worker-node';
      draft.ip = '192.168.1.31';
      draft.isMaster = false;
      draft.status = DEVICE_STATUS.HEALTHY;
    });

    const discoveredPortNode = produce(baseDiscoveredNode, (draft) => {
      draft.name = nonMasterNode.name;
      draft.ip = nonMasterNode.ip;
      draft.port = 4010;
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [nonMasterNode],
        discoveredNodes: [discoveredPortNode],
        apps: [],
      }),
      http.post(
        '*/api/control-plane/rpc/devices/reset',
        async ({ request }) => {
          resetPayload = await readOrpcInput(request);
          return orpcJsonResponse(null);
        },
      ),
    );

    await renderWithProviders(<Devices />);

    await user.click(page.getByRole('button', { name: nonMasterNode.name }));
    await user.click(page.getByRole('button', { name: 'Factory Reset' }));

    await expect
      .poll(() => page.getByRole('button', { name: 'Reset Device' }).elements())
      .toHaveLength(1);

    await user.click(page.getByRole('button', { name: 'Reset Device' }));

    await expect
      .poll(() => resetPayload)
      .toEqual({
        name: nonMasterNode.name,
        ip: nonMasterNode.ip,
        port: discoveredPortNode.port,
      });

    await expect
      .poll(() => page.getByRole('button', { name: 'Reset Device' }).elements())
      .toHaveLength(0);
  });

  test('blocks reset for master device', async ({ worker }) => {
    const user = userEvent.setup();

    const masterNode = produce(baseClusterNode, (draft) => {
      draft.name = 'control-node';
      draft.ip = '192.168.1.20';
      draft.isMaster = true;
      draft.status = DEVICE_STATUS.HEALTHY;
    });

    const discoveredPortNode = produce(baseDiscoveredNode, (draft) => {
      draft.name = masterNode.name;
      draft.ip = masterNode.ip;
      draft.port = 4011;
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [masterNode],
        discoveredNodes: [discoveredPortNode],
        apps: [],
      }),
    );

    await renderWithProviders(<Devices />);

    await user.click(page.getByRole('button', { name: masterNode.name }));

    await expect
      .poll(() =>
        page.getByRole('button', { name: 'Factory Reset' }).elements(),
      )
      .toHaveLength(1);
    await expect
      .element(page.getByRole('button', { name: 'Factory Reset' }))
      .toBeDisabled();
  });

  test('shows running app icons per node', async ({ worker }) => {
    const alphaNode = produce(baseClusterNode, (draft) => {
      draft.name = 'alpha-node';
      draft.ip = '192.168.1.21';
      draft.isMaster = true;
    });

    const betaNode = produce(baseClusterNode, (draft) => {
      draft.name = 'beta-node';
      draft.ip = '192.168.1.22';
      draft.isMaster = false;
    });

    const appOnAlpha = produce(baseApp, (draft) => {
      draft.spec.name = 'app-alpha';
      draft.iconUrl = 'https://cdn.simpleicons.org/docker';
      draft.pods = [
        {
          name: undefined,
          metadata: {
            creationTimestamp: undefined,
          },
          spec: {
            nodeName: 'alpha-node',
          },
          status: {
            phase: undefined,
            startTime: undefined,
            message: undefined,
            reason: undefined,
            conditions: undefined,
          },
        },
      ];
    });

    const appOnBeta = produce(baseApp, (draft) => {
      draft.spec.name = 'app-beta';
      draft.iconUrl = 'https://cdn.simpleicons.org/ubuntu';
      draft.pods = [
        {
          name: undefined,
          metadata: {
            creationTimestamp: undefined,
          },
          spec: {
            nodeName: 'beta-node',
          },
          status: {
            phase: undefined,
            startTime: undefined,
            message: undefined,
            reason: undefined,
            conditions: undefined,
          },
        },
      ];
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [alphaNode, betaNode],
        discoveredNodes: [],
        apps: [appOnAlpha, appOnBeta],
      }),
    );

    await renderWithProviders(<Devices />);

    const alphaRow = page.getByRole('row', { name: /alpha-node/ });
    const betaRow = page.getByRole('row', { name: /beta-node/ });

    await expect
      .element(alphaRow.getByRole('img', { name: 'app-alpha' }))
      .toBeInTheDocument();
    await expect
      .element(betaRow.getByRole('img', { name: 'app-beta' }))
      .toBeInTheDocument();

    await expect
      .poll(() => alphaRow.getByRole('img', { name: 'app-beta' }).elements())
      .toHaveLength(0);
    await expect
      .poll(() => betaRow.getByRole('img', { name: 'app-alpha' }).elements())
      .toHaveLength(0);
  });

  test('restarts app from node app context menu', async ({ worker }) => {
    let restartPayload: unknown;

    const alphaNode = produce(baseClusterNode, (draft) => {
      draft.name = 'alpha-node';
      draft.ip = '192.168.1.21';
    });

    const appOnAlpha = produce(baseApp, (draft) => {
      draft.spec.name = 'app-alpha';
      draft.iconUrl = 'https://cdn.simpleicons.org/docker';
      draft.pods = [
        {
          name: undefined,
          metadata: {
            creationTimestamp: undefined,
          },
          spec: {
            nodeName: 'alpha-node',
          },
          status: {
            phase: undefined,
            startTime: undefined,
            message: undefined,
            reason: undefined,
            conditions: undefined,
          },
        },
      ];
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [alphaNode],
        discoveredNodes: [],
        apps: [appOnAlpha],
      }),
      http.post(
        '*/api/control-plane/rpc/devices/restartApp',
        async ({ request }) => {
          restartPayload = await readOrpcInput(request);
          return orpcJsonResponse(null);
        },
      ),
    );

    await renderWithProviders(<Devices />);

    const appIcon = page.getByRole('img', { name: 'app-alpha' });
    await appIcon.click({ button: 'right' });
    await page.getByText('Restart App').click();

    await expect.poll(() => restartPayload).toEqual({ name: 'app-alpha' });
  });

  test('drains node from context menu', async ({ worker }) => {
    let drainPayload: unknown;

    const alphaNode = produce(baseClusterNode, (draft) => {
      draft.name = 'alpha-node';
      draft.ip = '192.168.1.21';
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [alphaNode],
        discoveredNodes: [],
        apps: [],
      }),
      http.post(
        '*/api/control-plane/rpc/devices/drainCurrentNodeApps',
        async ({ request }) => {
          drainPayload = await readOrpcInput(request);
          return orpcJsonResponse(null);
        },
      ),
    );

    await renderWithProviders(<Devices />);

    const nodeButton = page.getByRole('button', { name: 'alpha-node' });
    await nodeButton.click({ button: 'right' });
    await page.getByText('Drain').click();

    await expect.poll(() => drainPayload).toEqual({ name: 'alpha-node' });
  });

  test('keeps nodes sorted by name', async ({ worker }) => {
    const zetaNode = produce(baseClusterNode, (draft) => {
      draft.name = 'zeta-node';
      draft.ip = '192.168.1.29';
    });

    const alphaNode = produce(baseClusterNode, (draft) => {
      draft.name = 'alpha-node';
      draft.ip = '192.168.1.21';
    });

    const gammaNode = produce(baseClusterNode, (draft) => {
      draft.name = 'gamma-node';
      draft.ip = '192.168.1.25';
    });

    worker.use(
      ...mockDevicesQueries({
        clusterNodes: [zetaNode, alphaNode, gammaNode],
        discoveredNodes: [],
        apps: [],
      }),
    );

    await renderWithProviders(<Devices />);

    await expect
      .poll(() => {
        return page
          .getByRole('button')
          .elements()
          .map((element) => element.textContent?.trim() ?? '')
          .filter((name) => name.endsWith('-node'));
      })
      .toEqual(['alpha-node', 'gamma-node', 'zeta-node']);
  });

  test('pauses polling-driven churn during reset mutation', async ({
    worker,
  }) => {
    const user = userEvent.setup();
    const testDevicesPollIntervalMs = 1000;
    const testDiscoveredNodesPollIntervalMs = 500;
    const testAppsPollIntervalMs = 500;
    let queryRequestCount = 0;
    let releaseResetMutation: (() => void) | undefined;

    const nonMasterNode = produce(baseClusterNode, (draft) => {
      draft.name = 'worker-node';
      draft.ip = '192.168.1.31';
      draft.isMaster = false;
      draft.status = DEVICE_STATUS.HEALTHY;
    });

    const discoveredPortNode = produce(baseDiscoveredNode, (draft) => {
      draft.name = nonMasterNode.name;
      draft.ip = nonMasterNode.ip;
      draft.port = 4010;
    });

    worker.use(
      http.post('*/api/control-plane/rpc/devices/list', () => {
        queryRequestCount += 1;
        return orpcJsonResponse([nonMasterNode]);
      }),
      http.post('*/api/control-plane/rpc/devices/discoveredNodes', () => {
        return orpcJsonResponse([[discoveredPortNode.ip, discoveredPortNode]]);
      }),
      http.post('*/api/control-plane/rpc/devices/apps', () => {
        return orpcJsonResponse([]);
      }),
      http.post('*/api/control-plane/rpc/devices/reset', async () => {
        await new Promise<void>((resolve) => {
          releaseResetMutation = resolve;
        });
        return orpcJsonResponse(null);
      }),
    );

    await renderWithProviders(
      <Devices
        devicesPollIntervalMs={testDevicesPollIntervalMs}
        discoveredNodesPollIntervalMs={testDiscoveredNodesPollIntervalMs}
        appsPollIntervalMs={testAppsPollIntervalMs}
      />,
    );

    await expect.poll(() => queryRequestCount).toBeGreaterThan(0);

    await user.click(page.getByRole('button', { name: nonMasterNode.name }));
    await user.click(page.getByRole('button', { name: 'Factory Reset' }));
    await user.click(page.getByRole('button', { name: 'Reset Device' }));

    await expect.poll(() => typeof releaseResetMutation).toBe('function');
    const countWhileResetPending = queryRequestCount;

    await new Promise((resolve) => {
      setTimeout(resolve, testAppsPollIntervalMs * 2);
    });

    expect(queryRequestCount).toBe(countWhileResetPending);

    releaseResetMutation?.();

    await expect
      .poll(() => queryRequestCount, {
        timeout: testAppsPollIntervalMs * 4,
      })
      .toBeGreaterThan(countWhileResetPending);
  });
});
