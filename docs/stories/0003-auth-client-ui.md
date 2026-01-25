## Context

Auth Client support has landed in the backend schema and manifest pipeline, but the UI still lacks a way to model it alongside app configuration. We need an Additional Resources section in the Application Form so users can attach one or more Auth Clients without leaving the app workflow, keeping definitions complete and portable.

## Acceptance Criteria

- [x] **Existing Auth Clients load**: When editing an app that already has Auth Clients, the Application Form shows them.
- [x] **Add Auth Clients in-form**: Users can add an Auth Client to an app from the Application Form without leaving the page.
- [x] **Manage multiple Auth Clients**: Users can add more than one Auth Client and remove any of them.
- [x] **Sensible default name**: A newly added Auth Client starts with the name `authclient`.
- [x] **Provide required Auth Client details**: Users can enter a name and at least one redirect URI for each Auth Client.
- [x] **Provide optional logout details**: Users can add post-logout redirect URIs when needed, and leave them empty otherwise.

## Tech Notes

### Render Additional Resources section

- Add the section to the end of `app/(dashboard)/apps/application-form.tsx`, after Environment Variables and before the submit button.
- Use the existing `Select` + `Button` patterns for the dropdown and “Add Resource” control.

### Support multiple Auth Clients

- Add a `useFieldArray` for `additionalResources` in `app/(dashboard)/apps/application-form.tsx`.
- Render a list of resource cards with a remove button (trash icon) per card.
- Keep the resource type label in each card header (“Auth Client”).

### Default Auth Client name

- When appending a new Auth Client entry, set `metadata.name` to `authclient` and include the required `apiVersion` + `kind` fields.

### Capture Auth Client fields

- Each card includes inputs for `metadata.name`, a `redirectUris` list (at least one item), and an optional `postLogoutRedirectUris` list.
- Use nested `useFieldArray` for each URI list; only create `postLogoutRedirectUris` when the user opts to add one.

### Wire form defaults + validation

- Extend the default form data to include `additionalResources: []`.
- Keep schema requirements aligned with `app/api/schemas/auth-client-schema.ts` so redirect URIs remain required and post-logout URIs stay optional.
- **Testing**: Extend `app/(dashboard)/apps/application-form.browser.test.tsx` to cover adding/removing Auth Clients and editing both URI lists.
