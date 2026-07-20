# Task Harness

Each implementation task is a standalone Markdown file in this directory. A task should be small enough for one agent to complete and validate without making unrelated architecture decisions.

## Naming

Use:

```text
NNN-short-outcome.md
```

Examples:

```text
001-configure-headless-validation.md
010-player-moves-in-test-room.md
021-place-and-reload-workbench.md
```

Numbers indicate dependency order, not priority alone.

## Status

- `draft`: requirements or decisions are missing.
- `ready`: dependencies and acceptance criteria are complete.
- `in_progress`: one assigned owner is implementing.
- `blocked`: an explicit external dependency prevents progress.
- `done`: acceptance and validation are complete.

Only `ready` tasks should be assigned for implementation.

## Task quality rules

- One primary player-visible or developer-visible outcome.
- Explicit dependencies and out-of-scope list.
- Links to only relevant Harness documents.
- State, save, data, UI, asset, network, localization, and accessibility impact stated.
- Acceptance criteria are observable and binary where possible.
- Validation commands and evaluation files are named.
- No instruction to hardcode temporary content into generic logic.

Use `TEMPLATE.md` for new tasks.
