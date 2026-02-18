# PROMPT.md — SpecPM Ralph Loop

You are building SpecPM, a spec package manager for AI-driven development.

## Every iteration:

1. Read `AGENTS.md` for conventions, stack, and rules
2. Read `IMPLEMENTATION_PLAN.md` and find the next uncompleted task
3. Read the spec file referenced by that task (in `specs/`)
4. Implement the task: write code, write tests
5. Run tests: `pnpm test` — if they fail, fix until green
6. Run build: `pnpm build` — if it fails, fix until green
7. Mark the task as done in `IMPLEMENTATION_PLAN.md` (add ✅)
8. Commit: `git add -A && git commit -m "<type>(<scope>): <description>"`
9. Exit cleanly so the next loop iteration starts fresh

## Rules:
- ONE task per iteration. Do not skip ahead.
- If a task is already marked ✅, skip to the next one.
- If all tasks in a phase are done, move to the next phase.
- If tests fail, fix them before committing. Do not commit broken code.
- Read the relevant spec BEFORE writing any code.
- Follow AGENTS.md conventions strictly.
