# Devices Page Browser Tests Plan

Prioritized test cases for `app/(dashboard)/devices/devices.tsx`, ordered by implementation priority.

1. **renders adopted and discovered devices in one table** ✅ Completed
   - Validate core data merge of `devices` and `discoveredNodes`.
   - Assert statuses, names, and IPs render correctly.

2. **opens node details sheet from table row and closes correctly**
   - Verify primary interaction for inspecting node details.
   - Assert selected node details appear and sheet closes properly.

3. **adopts a new device and refreshes data state**
   - Validate `Adopt Device` flow.
   - Assert mutation payload (`name`, `ip`, `port`) and refreshed UI state.

4. **resets a non-master device via confirmation dialog**
   - Cover destructive action path.
   - Assert dialog open/confirm behavior and mutation payload.

5. **blocks reset for master device**
   - Ensure safety guardrail remains intact.
   - Assert reset action is disabled for master node.

6. **shows running app icons per node**
   - Validate app-to-node mapping logic.
   - Assert each node shows only apps scheduled on that node.

7. **restarts app from node app context menu**
   - Validate app control path from devices page.
   - Assert `restartApp` mutation is called with selected app name.

8. **drains node from context menu**
   - Validate operational action wiring.
   - Assert `drainCurrentNodeApps` mutation payload is correct.

9. **keeps nodes sorted by name**
   - Prevent regressions in row ordering behavior.
   - Assert alphabetical render order independent of API response order.

10. **pauses polling-driven churn during reset mutation**
    - Validate stability behavior while reset is pending.
    - Assert UI/query behavior stays stable during pending state.

## Implementation Approach (TDD)

We will implement the list strictly in priority order using a red-green-refactor loop for each test case.

### Per-test workflow

1. **Red - add one test only**
   - Add the next highest-priority browser test with clear Arrange/Act/Assert sections.
   - Use MSW handlers and fixtures to define only the data required for that scenario.
   - Keep test descriptions in present tense.

2. **Red - run the target test and confirm failure**
   - Run only the new test (or file) to confirm it fails for the expected reason.
   - If it passes immediately, strengthen assertions until it fails meaningfully.

3. **Green - implement minimal production change**
   - Update `devices.tsx` (or related components/hooks) with the smallest change needed to satisfy the test.
   - Avoid broad refactors while driving behavior with tests.

4. **Green - rerun target test and confirm pass**
   - Re-run the same test scope and verify it now passes.

5. **Refactor - clean up safely**
   - Improve names, remove duplication, and extract helper functions only when behavior is covered.
   - Re-run the affected test file to ensure no regressions.

6. **Regression check before next test**
   - Run `pnpm run dance` after finishing each priority item (or at least every small batch) to keep the suite stable.
   - Then move to the next item in the priority list.

### Guardrails

- Implement one priority item at a time; do not batch multiple new behaviors before validating.
- Prefer user-centric selectors (`getByRole`, `getByLabelText`, `getByText`).
- Reuse fixtures with `produce` to make test setup explicit.
- Prefer MSW over manual fetch mocking.
- Add concise comments in tests when they clarify non-obvious setup or intent (for example, batched tRPC payload shape).
- Avoid redundant comments that only restate obvious actions.
