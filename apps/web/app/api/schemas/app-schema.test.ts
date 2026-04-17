import { describe, expect, it } from 'vitest';

import { deploymentJsonPatchSchema } from './app-schema';

describe('deploymentJsonPatchSchema', () => {
  it('requires value for add operations', () => {
    const result = deploymentJsonPatchSchema.safeParse({
      op: 'add',
      path: '/spec/template/spec/securityContext',
    });

    expect(result.success).toBe(false);
  });

  it('requires from for copy operations', () => {
    const result = deploymentJsonPatchSchema.safeParse({
      op: 'copy',
      path: '/spec/template/spec/volumes/0',
    });

    expect(result.success).toBe(false);
  });

  it('rejects blocked deployment paths', () => {
    const result = deploymentJsonPatchSchema.safeParse({
      op: 'replace',
      path: '/spec/selector/matchLabels/app',
      value: 'other-app',
    });

    expect(result.success).toBe(false);
  });

  it('parses allowed deployment patches', () => {
    const result = deploymentJsonPatchSchema.safeParse({
      op: 'add',
      path: '/spec/template/spec/securityContext',
      value: { fsGroup: 1000 },
    });

    expect(result.success).toBe(true);
  });

  it('parses host networking deployment patches', () => {
    const result = deploymentJsonPatchSchema.safeParse({
      op: 'add',
      path: '/spec/template/spec/hostNetwork',
      value: true,
    });

    expect(result.success).toBe(true);
  });

  it('parses DNS policy deployment patches', () => {
    const result = deploymentJsonPatchSchema.safeParse({
      op: 'add',
      path: '/spec/template/spec/dnsPolicy',
      value: 'ClusterFirstWithHostNet',
    });

    expect(result.success).toBe(true);
  });
});
