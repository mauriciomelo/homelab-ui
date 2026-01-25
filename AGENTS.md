# Agent Guidelines

## General guidelines

- After making changes, remember to run `pnpm run dance` to verify changes. This command runs linting, type checking, and tests.

## Testing instructions

- Run tests with `pnpm run dance`. This command runs linting, type checking, and all tests.
- **Test Descriptions:** Use the present tense. Do NOT use "should".
  - ✅ Preferred: `it('handles ADDED event', () => { ... })`
  - ❌ Avoid: `it('should handle ADDED event', () => { ... })`
- **Mocking:** Prefer MSW (Mock Service Worker) for API/http mocking over manually mocking `fetch` or API clients. This ensures tests more accurately reflect real-world usage.
- **Test Style:** Favor integration-style tests over isolated unit tests, especially for React components. Testing user behavior and interactions creates more resilient tests than testing implementation details.
- **Selectors:** Prefer user-centric queries like `getByRole`, `getByLabelText`, `getByText`. Avoid `getByTestId` unless there is no accessible alternative, but prefer to edit the target component to add accessibility attributes if necessary.

  ```typescript
  page.getByRole('button', { name: 'Create' });
  page.getByLabelText('Redirect URI');
  ```

- **Test Data:** When creating test data, check if there's a reusable fixture in `test-utils/fixtures.ts`. Create a new one if appropriate. Use immer's `produce` function to create variations of existing fixtures by only overriding the relevant fields for that test. Always use `produce` to override fields, even if the base fixture is acceptable as-is, to make explicit what fields are important for that test. This makes tests easier to understand by clearly showing the setup state. Example following the AAA (Arrange, Act, Assert) pattern:

  ```typescript
  it('updates deployment with new spec', async () => {
    // Arrange - modify fixture to show setup state
    const appName = 'test-app';
    const currentDeployment = produce(baseDeployment, (draft) => {
      draft.metadata.name = appName;
      draft.spec.template.spec.containers[0].image = 'old-image:1.0';
      draft.spec.template.spec.containers[0].env = [];
    });

    // Act - perform the operation
    await updateApp(currentDeployment, { image: 'new-image:2.0' });

    // Assert - verify the new state
    const updatedApp = await getAppByName(appName);
    expect(updatedApp.spec.template.spec.containers[0].image).toBe(
      'new-image:2.0',
    );
  });
  ```

## Coding conventions

- **Comments:** Avoid redundant comments. Prioritize descriptive naming over code comments, but include comments when the code's intent or context isn't immediately obvious.
- **React Stack:** Use **Tailwind CSS** for styling and **shadcn/ui** for UI components.
- **Type Safety:** Do not use explicit `any` or type casting (e.g., `as` in TypeScript). Use proper type definitions instead.
