# Repository Agent Instructions

This repository contains a Godot game client, a Backend for optional online services, shared contracts, and an existing protected Frontend.

## Mandatory entry point

Before planning or implementing game work, read:

1. `README.md` for the original vision.
2. `godot/HARNESS.md` for the complete product and engineering contract.
3. The nearest `AGENTS.md` for the directory being changed.
4. The assigned `ready` task under `godot/docs/tasks/`.

No implementation should begin from the roadmap alone. A roadmap item must first become a task with explicit scope, dependencies, acceptance criteria, and validation.

## Repository ownership

- `godot/`: primary top-down 2D game client and offline gameplay.
- `Backend/`: identity, cloud saves, multiplayer authority/transport, LLM providers, and commerce verification.
- `contracts/`: versioned contracts shared between Godot and Backend.
- `Frontend/`: protected; do not modify unless the user explicitly changes this instruction.
- `README.md`: user-owned original design source; preserve its intent and unrelated edits.

## Global constraints

- Do not hardcode content, physical input keys, localized text, service URLs, balance values, or save versions in gameplay scripts.
- Keep the local core loop functional without login or network services.
- Never place secrets or authoritative online grants in a client project.
- Durable state changes require save and migration analysis.
- Shared online changes require contract analysis.
- Do not delete, move, or repurpose user files as cleanup unless a task explicitly requires it.
- Report unrelated pre-existing changes without modifying them.

## Completion

Follow the work loop and definition of done in `godot/HARNESS.md` and the nearest directory-specific `AGENTS.md`.
