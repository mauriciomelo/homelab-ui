---
description: Run the best test of a component in watch mode so I can use it as a playground.
agent: build
model: minimax/minimax-m2
---

React component: $ARGUMENTS

Find the best test file for the given React component and run it in watch mode using Vitest.

When the test is found, it should print the following information (DO NOT include any other param other than `-t`), replace `"test name here"` with the actual test name:

Component File:

```bash
code /path/to/component/file.tsx
```

Test File:

```bash
code /path/to/test/file.tsx
```

Command:

```bash
pnpm test -t "test name here"
```

# Recap

- Find the React component (matching the given description "$ARGUMENTS").
- Find the test file
- List the test names using `pnpm vitest list --browser.headless testname.browser.test.tsx`
- Choose the best test name from the list, preferably one that covers the component functionality, like successful form submission.
- Print output

Be EXTREMELY concise, sacrifice grammar for brevity. Output the info SUPER fast.
