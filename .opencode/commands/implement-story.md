---
description: Implement the next highest priority task from a story and mark it complete.
agent: build
---

User notes: $ARGUMENTS

Implement the highest priority task from the selected story in `docs/stories`.

Story selection:

- If Story is provided, resolve the story file by matching the id or filename in `docs/stories`.
- Otherwise, try to match the current git branch name to a story filename (exact match preferred; fall back to slug match).
- If still ambiguous, ask the user which story to use. Create a branch with the story name if not already on it.

Task selection:

- The Task List / ACs order is the default priority order.
- If a later task clearly has no dependencies and an earlier task does, you may elevate the later task.
- Do not use priority markers.
- Implement exactly one task per run.

Implementation requirements:

- Before implementation, output the story name, task name, and your implementation plan. Proceed only after user confirmation.
- Make the code change for the selected task only.
- Do not update the story file to check off the task until the user confirms the task is complete.
- Run `pnpm run dance` and confirm it passes.
- Do not move to the next task automatically (unless explicitly requested). The next task will be selected in the next run after validated by the user.

TDD workflow:

- Create a single test and make it fail.
- Implement so it passes.
- Refactor if needed.

Output:

- Be concise.
- State the selected story file and task title.
- If applicable, report difficulties encountered and how you resolved them, included decisions and any other relevant details.
- When the task is complete, list potential refactoring opportunities and ask the user to confirm task completion.
