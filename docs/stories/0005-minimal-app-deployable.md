## Context

We need the app form to create a minimal application that can be deployed successfully without manual edits. Today the form only outputs deployment, ingress, and a limited set of optional resources, which leaves out required base resources like Service and Namespace and prevents some apps from deploying cleanly. This story focuses on the smallest set of changes that make a deployable app possible end-to-end.

## Acceptance Criteria

- [x] **api: add missing required resources**: Creating an app produces Service and Namespace alongside the existing required resources, and reading those manifests returns a valid App spec without losing required fields.
- [x] **api: support minimal health check schema + defaults**: The App schema supports the minimal health check configuration, and generated manifests include startup/readiness/liveness probes with sensible defaults.
- [x] **api: apply safe deployment strategy**: Generated deployments default to `Recreate` strategy to avoid concurrent pods for stateful apps.
- [ ] **ui: capture minimal deployable inputs**: The Application Form captures the minimum data needed to deploy (name, image, ports, and health check inputs) with sensible defaults.
- [ ] **ui: apply health check defaults**: Enabling the minimal health check creates startup/readiness/liveness probes with sensible defaults.

## Tech Notes

### API: Required resources generated

- Extend schemas to include Service and Namespace (new schema files like `app/api/schemas/service-schema.ts` and `app/api/schemas/namespace-schema.ts`).
- Update `AppResourceType` and file handling in `app/api/applications.ts` to read/write Service and Namespace manifests.
- Update `app/api/app-k8s-adapter.ts` to emit Service and Namespace in `toManifests` using values derived from `AppSchema`.
- Default deployment strategy to `Recreate` when generating manifests.

### API: Minimal manifests load correctly

- Update `fromManifests` in `app/api/app-k8s-adapter.ts` to tolerate Service/Namespace presence and preserve required fields for round-trip.
- Add coverage in `app/api/applications.test.ts` for create + read with Service/Namespace resources.

### UI: Minimal app creation works

- Keep the form minimal but ensure required values are present in `AppSchema` defaults in `app/(dashboard)/apps/application-form.tsx`.
- Ensure the create flow persists Service and Namespace without extra user input.

### UI: Required defaults are sensible

- Default service port name to the selected app port; default service port number to the port value used in the container.
- Default ingress annotations to `{}`.

### Testing

- Update `app/(dashboard)/apps/application-form.browser.test.tsx` to cover minimal app creation with required defaults.
- Run `pnpm run dance`.

### Expected Health Check shape

```typescript
/*
Minimal config for now. This should set sensible defaults for startup, readiness, and liveness probes.
Startup is responsible for initial delay, readiness/liveness start immediately once startup succeeds.
Can be extended in the future.
*/

/** check: httpGet for now and can easily become a discriminated union to support tcpSocket or exec */
type Check = { type: 'httpGet'; path: '/'; port: 'web' };
type App = {
  // ... app spec
  health: {
    check: Check;
  };
};

// Future extensibility

type CommonHealthConfig = {
  intervalSeconds: number;
  failureThreshold: number;
};

type App = {
  // ... app spec
  health: CommonHealthConfig & {
    check: Check;
    startup: CommonHealthConfig & {
      // ...overrides
    };
    readiness: CommonHealthConfig & {
      // ...overrides
    };
    liveness: CommonHealthConfig & {
      // ...overrides
    };
  };
};
```

### Health Check defaults

- Startup: `initialDelaySeconds=5`, `periodSeconds=5`, `timeoutSeconds=2`, `failureThreshold=60`
- Readiness: `periodSeconds=10`, `timeoutSeconds=2`, `successThreshold=1`, `failureThreshold=3`
- Liveness: `periodSeconds=10`, `timeoutSeconds=2`, `successThreshold=1`, `failureThreshold=3`
