# Alook
Alook's main purpose is to make the cli agent always on, and give it a email address.

## Navigation
- `plans/`: place your dev plans
- `src/web`: landing page + user dashboard
- `src/cli`: cli + daemon

## Plan-driven Development
- You must make a markdown plan at `plans/` before you implement any my request, otherwise I will reject your implementation.
- The `plans/` directory is gitignored — plans are kept locally and do not need to be committed or included in PRs.
- Remember to update the dev plan after you finish coding.
- When every task is completed, make sure you check the task checkbox in the corresponding plan.
- A plan should at least contain `features`/`show case`, `designs overview`, `new deps`, `TODOS`, sections.
  - always use the features/show case to present what you're going to build.
  - in `new deps` section, you must list all the new external dependencies that will be added.
  - use checklist in `TODOS` section, for each checkbox, you must have a clear descripion of what to do and list all the files that will be modified.
    - at the end of TODOS, you must include `test cases` sub section, use checklist format to list all the test cases that should be covered.

## Always WRITE/RUN TESTS!
- never report to me about your code changes without running tests first.
- always write tests for your code changes, only when your code changes are already covered by the current tests.