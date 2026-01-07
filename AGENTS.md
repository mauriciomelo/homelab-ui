# Agent Guidelines

## General guidelines

- After making changes, remember to run `pnpm run dance` to verify changes. This command runs linting, type checking, and tests.

## Testing instructions

- Run tests without watch mode (e.g., `pnpm run test:ci` commands) to avoid getting stuck.
- Run a test in isolation by providing a name like `pnpm run test:ci -t "handles custom resource limits"`
- **Test Descriptions:** Use the present tense. Do NOT use "should".
  - ✅ Preferred: `it('handles ADDED event', () => { ... })`
  - ❌ Avoid: `it('should handle ADDED event', () => { ... })`
- **Mocking:** Prefer MSW (Mock Service Worker) for API mocking over manually mocking `fetch` or API clients. This ensures tests more accurately reflect real-world usage.
- **Test Style:** Favor integration-style tests over isolated unit tests, especially for React components. Testing user behavior and interactions creates more resilient tests than testing implementation details.

## Coding conventions

- **Comments:** Avoid redundant comments. Prioritize descriptive naming, but include comments when the code's intent or context isn't immediately obvious.
- **React Stack:** Use **Tailwind CSS** for styling and **shadcn/ui** for UI components.
