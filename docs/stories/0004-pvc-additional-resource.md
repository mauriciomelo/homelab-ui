## Context

We need to add first-class PersistentVolumeClaim (PVC) support as an additional resource type. Similar to Auth Clients, PVCs should be definable alongside an app and then referenced elsewhere, but for volume mounts instead of env variables. This keeps app definitions self-contained and makes storage wiring consistent with the existing additional resource workflow.

## Acceptance Criteria

- [x] **API: PVC manifests round-trip**: Apps can include PVC additional resources, and those resources persist through create/read flows without loss.
- [x] **API: Volume mounts reference PVCs**: App specs can define volume mounts that reference PVC additional resources, and invalid references are rejected.
- [ ] **UI: PVC resources editable**: The Application Form lets users add, edit, and remove PVC additional resources.
- [ ] **UI: Volume mounts link to PVCs**: The Application Form lets users add volume mounts and link them to PVC resources.

## Tech Notes

### Original Plan

- Add a new PVC schema: `app/api/schemas/persistent-volume-claim-schema.ts` with `apiVersion: v1`, `kind: PersistentVolumeClaim`, `metadata.name`, `spec.accessModes`, `spec.storageClassName`, and `spec.resources.requests.storage` (validate size string similar to memory units).
- Extend `app/api/schemas/app-schema.ts`:
  - Include PVC in `additionalResourceSchema`.
- Add `volumeMounts` to `AppSchema` (array of `{ mountPath, claimName }` or similar, using the claim name as the volume name).
  - Add validation to ensure volume mounts reference existing PVCs, similar to env secret validation.
  - Extend `deriveResourceReferences` (preferable) or add a PVC-specific helper for volume linking.
- Update Kubernetes manifest schemas:
  - `app/api/schemas/deployment-schema.ts`: allow `containers[].volumeMounts` and `spec.volumes[]` with `persistentVolumeClaim.claimName`.
- Update adapter logic:
- `app/api/app-k8s-adapter.ts`: map `AppSchema.volumeMounts` to `containers[].volumeMounts` + `spec.volumes`, using `claimName` as the volume name.
  - In `fromManifests`, reconstruct `volumeMounts` by pairing volumeMounts with volumes’ `claimName`.
- Update file loading/saving:
  - `app/api/applications.ts`: add PVC to `AppResourceType`, and update `schemaForFile` to recognize `.persistentvolumeclaim.yaml`.
- Add UI for PVC + volume mounts:
  - Add a PVC card (similar to `AuthClientCard`) for name/storage/accessModes.
- Add a “Volume Mounts” section similar to env vars, but keep the claim selection simple with a `Select` dropdown populated from PVC resources (no env-style link menu).
  - Add “Add PVC” to the Additional Resources dropdown.
- Update tests/fixtures:
  - Extend fixtures and `applications.test.ts` to cover PVC resources and volume mounts.
  - Update `application-form.browser.test.tsx` for PVC + volume link flows as needed.
- Run `pnpm run dance`.

### API: PVC manifests + validation

- Follow the Auth Client wiring in `app/api/schemas/app-schema.ts` and `app/api/app-k8s-adapter.ts`.
- Extend `app/api/applications.ts` to include PVCs in `AppResourceType`, write PVC manifests during create, and parse them in `getApps`.
- Add a Zod schema file for PVC resources, similar to `app/api/schemas/auth-client-schema.ts`.
- Validate `spec.resources.requests.storage` using the existing unit helpers (Ki/Mi/Gi).

### API: Volume mounts mapping

- Update `app/api/schemas/deployment-schema.ts` to accept `containers[].volumeMounts` and `spec.volumes[].persistentVolumeClaim` entries.
- Map `AppSchema.volumeMounts` into both container `volumeMounts` and pod `volumes` in `app/api/app-k8s-adapter.ts`, using `claimName` as the volume name.
- Rehydrate `AppSchema.volumeMounts` by pairing `volumeMounts` with `volumes` in `fromManifests`.

### UI: PVC resources + mounts

- Mirror the Additional Resources UI in `app/(dashboard)/apps/application-form.tsx` and `app/(dashboard)/apps/auth-client-card.tsx` for PVCs.
- Add a “Volume Mounts” section using `useFieldArray`, but keep the claim selection simple with a `Select` dropdown populated from PVC resources (no env-style link menu).

### Testing

- **Testing**: Update `app/api/applications.test.ts` and `app/(dashboard)/apps/application-form.browser.test.tsx` to cover PVC creation, linking, and validation. Use present tense test descriptions.
