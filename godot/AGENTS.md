# Agent Instructions

This directory contains the primary Godot game client. All implementation agents must follow this file and `HARNESS.md`.

## Required reading order

1. Read the repository `README.md` for the original game vision.
2. Read `HARNESS.md` for the execution contract.
3. Read the assigned file under `docs/tasks/`.
4. Read only the domain documents linked by that task.
5. Inspect the existing implementation and tests before proposing changes.

If the task conflicts with `docs/DECISIONS.md`, stop and report the conflict. Do not silently override an accepted decision.

## Protected scope

- `Frontend/` is outside the Godot implementation scope and must not be modified.
- Do not move, delete, or rewrite user-created assets without an explicit task.
- Do not add Backend behavior unless the task explicitly includes Backend work.
- Never place secrets, API keys, payment credentials, or LLM credentials in the Godot client.

## Work loop

For every task:

1. Confirm the task is ready and its dependencies are complete.
2. State assumptions and identify affected state, scenes, data, saves, and tests.
3. Make the smallest coherent vertical slice that satisfies the acceptance criteria.
4. Keep gameplay rules data-driven. Do not hardcode content, input keys, user-facing text, service URLs, balance values, or save versions inside scene scripts.
5. Run targeted tests first, then the full validation defined by the task.
6. Diagnose failures before changing implementation again.
7. Report changed files, validation results, remaining risks, and any migration impact.

## Architecture rules

- The game is a top-down 2D game unless `docs/DECISIONS.md` is amended.
- Organize gameplay by feature under `features/`; keep each scene close to its scripts and feature-specific assets.
- Put reusable static definitions under `data/`, serializable runtime state under `state/`, and external adapters under `infrastructure/`.
- UI may request actions and render state, but it must not own gameplay rules, write save files directly, or call Backend endpoints directly.
- Use stable IDs for content and saved entities. Display names are never identifiers.
- Keep local single-player functional without login, cloud services, multiplayer, LLM, or payment services.
- Add an Autoload only when the state must survive scene changes and has clear global ownership.

## Task discipline

- One task must have one primary user-visible outcome.
- Do not implement future roadmap items merely because a seam exists for them.
- New gameplay concepts require an update to `docs/CONTEXT.md`.
- New architectural decisions require an update to `docs/DECISIONS.md`.
- Save-shape changes require a migration plan and save compatibility tests.
- Network-contract changes require updates under `/contracts/`.

## Definition of done

A task is done only when its acceptance criteria pass, relevant automated tests pass, error states are handled, data is not hardcoded, save compatibility is addressed, documentation is updated, and no unrelated files were changed.
