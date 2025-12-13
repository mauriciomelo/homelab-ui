# Agent Guidelines

## Setup commands

- Run tests without watch mode to avoid getting stuck: `pnpm test --watch=false` or ``pnpm test:browser --watch=false` for browser tests.

## Testing instructions

- **Test Descriptions:** Use the present tense. Do NOT use "should".
  - ✅ Preferred: `it('handles ADDED event', () => { ... })`
  - ❌ Avoid: `it('should handle ADDED event', () => { ... })`
- **Mocking:** Prefer MSW (Mock Service Worker) for API mocking over manually mocking `fetch` or API clients. This ensures tests more accurately reflect real-world usage.
- **Test Style:** Favor integration-style tests over isolated unit tests, especially for React components. Testing user behavior and interactions creates more resilient tests than testing implementation details.

## Coding conventions

- **Comments:** Avoid redundant comments. Prioritize descriptive naming, but include comments when the code's intent or context isn't immediately obvious.
- **React Stack:** Use **Tailwind CSS** for styling and **shadcn/ui** for UI components.
