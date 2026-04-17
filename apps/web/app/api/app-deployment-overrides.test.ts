import { describe, expect, it } from 'vitest';
import { produce } from 'immer';

import { applyDeploymentJsonPatches } from './app-deployment-overrides';
import { baseDeployment } from '@/test-utils/fixtures';

describe('applyDeploymentJsonPatches', () => {
  it('applies allowed deployment JSON patches', () => {
    const deployment = produce(baseDeployment, (draft) => {
      draft.metadata.name = 'demo-app';
      draft.spec.template.metadata.labels.app = 'demo-app';
      draft.spec.selector.matchLabels.app = 'demo-app';
      draft.spec.template.spec.containers[0].name = 'demo-app';
      draft.spec.template.spec.containers[0].volumeMounts = [];
    });

    const patchedDeployment = applyDeploymentJsonPatches({
      deployment,
      patches: [
        {
          op: 'add',
          path: '/spec/template/spec/securityContext',
          value: { fsGroup: 1000 },
        },
        {
          op: 'add',
          path: '/spec/template/spec/containers/0/securityContext',
          value: { runAsUser: 1000, runAsGroup: 1000 },
        },
        {
          op: 'add',
          path: '/spec/template/spec/containers/0/volumeMounts/0',
          value: { name: 'config', mountPath: '/config' },
        },
        {
          op: 'add',
          path: '/spec/template/spec/hostNetwork',
          value: true,
        },
        {
          op: 'add',
          path: '/spec/template/spec/dnsPolicy',
          value: 'ClusterFirstWithHostNet',
        },
      ],
    });

    expect(patchedDeployment.spec.template.spec.securityContext).toEqual({
      fsGroup: 1000,
    });
    expect(
      patchedDeployment.spec.template.spec.containers[0].securityContext,
    ).toEqual({
      runAsUser: 1000,
      runAsGroup: 1000,
    });
    expect(patchedDeployment.spec.template.spec.containers[0].volumeMounts).toEqual(
      [{ name: 'config', mountPath: '/config' }],
    );
    expect(patchedDeployment.spec.template.spec.hostNetwork).toBe(true);
    expect(patchedDeployment.spec.template.spec.dnsPolicy).toBe(
      'ClusterFirstWithHostNet',
    );
  });

  it('fails when a valid patch targets a missing runtime path', () => {
    const deployment = produce(baseDeployment, (draft) => {
      draft.metadata.name = 'demo-app';
      draft.spec.template.metadata.labels.app = 'demo-app';
      draft.spec.selector.matchLabels.app = 'demo-app';
      draft.spec.template.spec.containers[0].name = 'demo-app';
    });

    expect(() =>
      applyDeploymentJsonPatches({
        deployment,
        patches: [
          {
            op: 'add',
            path: '/spec/template/spec/containers/0/volumeMounts/0',
            value: { name: 'config', mountPath: '/config' },
          },
        ],
      }),
    ).toThrow();
  });
});
