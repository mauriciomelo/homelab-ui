## Context

The application backend and schema have been updated to support **Named Ports** (e.g., `http: 80`, `metrics: 9090`). However, the current UI (`ApplicationForm`) does not yet expose a way for users to define these ports. It currently provides a static default and a free-text input for the Ingress port name, which is error-prone. We need to update the UI to allow managing multiple ports and safely selecting the Ingress port.

## Task List / ACs

- [x] **Render Ports List**: Update the form to render the list of existing ports using input fields (Name, Container Port).
- [x] **Manage Ports (Add/Remove)**: Implement functionality to add new ports and remove existing ones.
- [x] **Refactor Ingress Selection**: Replace the Ingress Port text input with a Dropdown populated by the defined ports.
- [x] **Fix Form Scroll**: Fix a bug where the form grows and the update button becomes unreachable. The sheet content should be scrollable.
- [x] **Validate Port Uniqueness**: Ensure that port names and port numbers are unique within the ports list.

## Tech Notes

### Render Ports List

- Initialize `useFieldArray` for `ports` in `app/(dashboard)/apps/application-form.tsx`.
- Render a list of inputs for `name` and `containerPort` for each item in the fields array.
- Ensure existing data (if any) is correctly loaded into these fields.
- **Testing**: Verify that existing ports from the backend are correctly displayed in the form fields.

### Manage Ports (Add/Remove)

- Add an "Add Port" button that appends a new port object (e.g., `{ name: '', containerPort: 80 }`).
- Add a "Remove" button (trash icon) next to each port row.
- Ensure validation logic allows adding/removing without crashing.
- **Testing**: Extend `app/(dashboard)/apps/application-form.browser.test.tsx` to verify clicking "Add Port" creates new fields and "Remove" deletes them.

### Refactor Ingress Selection

- Component: Change from `<Input>` to `<Select>` (Dropdown).
- Source: Dynamically mapped from the "Ports" form values.
- Validation: Ingress port name must exist in the `ports` array (enforced by the Dropdown).
- **Testing**: Extend `app/(dashboard)/apps/application-form.browser.test.tsx` to verify the dropdown options update when ports change and that selecting a valid port works.

### Fix Form Scroll

- Inspect `app/(dashboard)/apps/application-form.tsx` and the `Sheet` component usage.
- Ensure the container wrapping the form fields has correct overflow handling (e.g., `overflow-y-auto`) and is configured to fill the available vertical space within the sheet, allowing it to scroll when content exceeds the viewport.
- **Testing**: Add multiple ports until the list exceeds the viewport height and verify that the scrollbar appears and the "Update" button remains accessible.

### Validate Port Uniqueness

- Update the Zod schema (likely in `app/(dashboard)/apps/formSchema.tsx`) to add a refinement.
- Ensure `name` is unique across all ports.
- Ensure `containerPort` is unique across all ports.
- **Testing**: Add test cases to verify that adding a port with a duplicate name or number prevents submission and displays an error.
