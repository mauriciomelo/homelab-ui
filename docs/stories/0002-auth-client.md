## Context

Apps that integrate with single sign-on need AuthClient resources to represent their clients. Keeping those manifests outside the app abstraction fragments ownership and makes it harder to keep app definitions complete and portable.

## Task List / ACs

- [x] **Create AuthClient schemas**: Add the AuthClient schema in `app/api/schemas` and wire it into the app schema.
- [x] **Support AuthClient in create/get**: Persist AuthClient manifests during `createApp` and round-trip them via `getApps`.

## Tech Notes

### Model additional resources

- Add an `additionalResources` field to `app/api/schemas/app-schema.ts`.
- The field is optional and an array; each entry has `kind`, `metadata.name`, and a `spec` shape matching the resource schema.
- Use a discriminated union keyed on `kind` so future resource types can be added.

### Generate and parse manifests

- Update `app/api/app-k8s-adapter.ts` to include `additionalResources` in `toManifests()` output.
- Update `fromManifests()` to map any supported resource manifests back into the app schema.

### Persist resources

- Update `app/api/applications.ts` to include additional resource manifests in filesystem writes.
- Ensure `kustomization.yaml` includes any additional resource filenames.

### Validate resource types

- Add a schema for `AuthClient` in `app/api/schemas`.
- Include it in the resource union and validation flow.
- Only include fields from the existing AuthClient manifest (redirect URIs + optional post-logout URIs).
