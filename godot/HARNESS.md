# Development Harness

This document is the operational contract for humans and AI agents building the Godot game. It converts the original game-design README into a repeatable process for planning, implementation, validation, and recovery.

## Product thesis

The player lives in a magical rented home presented as a top-down 2D world. Real-life actions such as study, work, exercise, creation, and rest advance an in-game timer. Completion grants resources. Resources support three outcomes:

1. Survival: food, energy, rest, and day progression.
2. Relationships: pet needs, memories, affection, growth, and dispatch.
3. Home growth: furniture, crafting stations, decoration, room expansion, soundscape, and travel.

Every major feature must strengthen this loop. A feature that does not affect the loop needs an explicit product reason and a task-level acceptance test.

## Current delivery mode

- Primary client: Godot.
- Presentation: top-down 2D.
- Initial mode: offline-first local single-player.
- First milestone: a small playable vertical slice, not a broad collection of disconnected systems.
- Deferred adapters: account login, cloud save, multiplayer, LLM generation, and commerce.
- Protected project: do not modify `Frontend/`.

Top-down 2D means player movement and interaction occur on a 2D plane; rooms use 2D collision, navigation, depth ordering, and camera rules. It does not imply a specific art style, tile size, camera zoom, or control scheme. Those values belong in data or recorded decisions.

## Source-of-truth hierarchy

When documents disagree, use this order:

1. `docs/DECISIONS.md` for accepted technical and product decisions.
2. The currently assigned task and its approved acceptance criteria.
3. `docs/SPEC.md` for product scope and required behavior.
4. `docs/CONTEXT.md` for domain terminology and ownership.
5. `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` for implementation shape.
6. The root `README.md` for original intent and long-term ideas.
7. Existing code, which may be incomplete or transitional.

A task cannot silently contradict an accepted decision. A task that intentionally changes one must include review and amendment of `docs/DECISIONS.md` in its acceptance criteria.

## Non-negotiable engineering principles

### Build vertical slices

Implement complete player outcomes through UI, gameplay state, persistence, and validation. Avoid building many isolated managers before any loop is playable.

### Keep content data-driven

Items, recipes, furniture capabilities, action categories, rewards, pet preferences, events, weather outcomes, dialogue references, audio layers, and progression conditions must be defined as content data. Scene scripts implement reusable behavior and interpret definitions.

Never use a display name as an ID. Never scatter recipe values, item rewards, input keys, file paths, service URLs, or localized text through gameplay scripts.

### Separate definitions, runtime state, and presentation

- Definitions describe what content can exist.
- Runtime state describes what exists in the current save.
- Presentation renders state and gathers player intent.

UI must not become the owner of inventory, crafting, pet, event, or save rules.

### Preserve offline play

The core loop must work without an account or network connection. Online adapters add synchronization and social behavior; they do not become required dependencies of local gameplay.

### Design persistence from the beginning

Any feature that creates durable player progress must declare:

- What is saved.
- Which owner holds the state.
- When it is written.
- How older saves migrate.
- What happens when data is missing, invalid, or from a newer version.

### Make time and randomness controllable

Game time, real time, timers, random region selection, random houses, loot, weather, and pet dispatch must be accessed through replaceable interfaces. Tests must be able to provide a fixed clock and seeded random source.

### Treat external services as adapters

Local save, cloud save, authentication, multiplayer transport, LLM generation, payments, analytics, and platform APIs live behind explicit seams. Gameplay features depend on stable interfaces, not vendor SDKs or HTTP details.

## Agent execution loop

### 1. Orient

- Read this file, the assigned task, and linked context.
- Inspect all files named in the task before editing.
- Identify the player-visible outcome.
- Identify affected definitions, runtime state, scenes, adapters, saves, tests, and contracts.

### 2. Check readiness

A task is ready only when:

- Its outcome is observable by a player or test.
- Dependencies are complete or explicitly stubbed by the task.
- Acceptance criteria are concrete.
- Out-of-scope behavior is listed.
- Required art/audio may use approved placeholders.
- Save and migration impact is stated.
- Network or Backend ownership is stated when relevant.

If these are missing, improve the task document before implementation.

### 3. Plan the smallest coherent change

Prefer one end-to-end path. For example, inventory work should cover one item definition, one runtime stack, one UI rendering path, one interaction, one save/load round trip, and tests. It should not pre-build every item category.

### 4. Implement through module interfaces

- Feature modules own their gameplay rules.
- State modules own serializable state shapes.
- Infrastructure adapters own files, networking, and external services.
- UI owns view state only.
- Signals and explicit method calls communicate intent; do not rely on brittle scene-tree paths or hidden global mutation.

### 5. Validate in layers

Run the narrowest useful checks first:

1. Data/schema validation.
2. Unit tests for deterministic rules.
3. Integration tests for feature seams and persistence.
4. Headless project load and scene checks.
5. Manual or automated player-flow evaluation.
6. Full validation required by the task.

### 6. Recover deliberately

When validation fails:

- Reproduce the failure consistently.
- Determine whether the defect is in definition data, runtime state, presentation, adapter behavior, or test assumptions.
- Add a regression test for confirmed defects.
- Do not weaken acceptance criteria merely to make a test pass.

### 7. Report

Every completion report includes:

- Player-visible result.
- Files changed.
- Tests and evaluations run.
- Save/schema/API impact.
- Known limitations.
- Follow-up tasks that are newly unblocked.

## Required architecture checks

Before completing any gameplay task, answer these questions:

- Is this behavior reusable across more than one content definition?
- Is content represented in data instead of conditionals tied to specific item names?
- Does the state have one clear owner?
- Can the rule be tested without rendering a scene?
- Can the feature run offline?
- Does the save contain stable IDs rather than scene node paths or display strings?
- Can missing assets or unavailable external services fail safely?
- Does the change preserve input remapping, localization, and accessibility?
- Are multiplayer authority and synchronization explicitly out of scope or handled?

## System ownership

| Area | Owner | Must not own |
| --- | --- | --- |
| App startup and scene transitions | `app/` | Gameplay rules |
| Player movement and interaction | `features/player/` | Inventory storage or save files |
| Home, regions, weather | `features/world/` | Account identity |
| Inventory and storage queries | `features/inventory/` | Crafting recipes |
| Furniture placement and capabilities | `features/furniture/` | UI navigation |
| Crafting eligibility and transactions | `features/workbench/` | Raw file access |
| Real-life action scheduling and rewards | `features/actions/` | Wall-clock implementation |
| Cooking process and food quality | `features/cooking/` | Pet preference definitions |
| Pet needs, memory, affection, dispatch | `features/pets/` | LLM credentials |
| Dialogue and event sequencing | `features/dialogue/`, `features/events/` | Backend transport |
| Day progression | `features/day_cycle/` | OS time directly |
| Serializable active state | `state/` | Rendering and HTTP calls |
| Local/cloud persistence | `infrastructure/persistence/` | Gameplay decisions |
| Network/auth/multiplayer transport | `infrastructure/network/` | Offline game rules |
| Static definitions | `data/` | Mutable save state |
| Cross-feature presentation | `ui/` | Domain ownership |

## Data-driven requirements

The following must be authorable without editing gameplay scripts:

- Item IDs, categories, stack limits, tags, expiration behavior, and icons.
- Recipe inputs, outputs, station requirements, discovery conditions, and quality rules.
- Furniture footprint, placement rules, interaction capabilities, action unlocks, storage capacity, and audio emitters.
- Action category, duration limits, energy/hunger costs, furniture requirements, reward tables, and interruption rules.
- Pet species, preferences, needs, affection thresholds, behaviors, dispatch destinations, and growth rules.
- Events, prerequisites, mutually exclusive branches, consequences, unlocks, and replay policy.
- Weather definitions, transitions, audio layers, visual effects, and drop tables.
- Regions, house variants, spawn anchors, and starting-content pools.
- Dialogue keys, localization keys, portraits, speaker IDs, and conditional branches.
- Audio layers and environmental conditions.

When a definition format changes, add validators and document migration expectations for both content and saves.

## Persistence policy

Separate three durable concepts:

- Player profile: identity-neutral preferences, accessibility, account binding, and save-slot metadata.
- World save: region, house, day/time, inventory, furniture, stations, pets, events, weather, mail, and progression.
- Session state: temporary UI, local connection, multiplayer membership, and in-progress network messages. Session state is not part of the durable world save unless explicitly promoted.

Use a versioned save envelope, stable entity IDs, atomic writes, backup/recovery behavior, and migrations. Settings use a separate configuration store. Local save is the first adapter; cloud save arrives later behind the same repository interface.

## Multiplayer policy

Multiplayer is deferred until the single-player loop and save model are stable. The intended model is host-owned world play:

- The host selects and uploads a world save to start a session.
- The server or authoritative host validates durable world mutations.
- Visitors can perform only explicitly permitted actions.
- Story events do not advance in multiplayer by default.
- Furniture placement, shared daily progress, pet interaction, station use, and friendship rewards require explicit authority and conflict rules.
- Session exit must reconcile or discard temporary changes according to a recorded policy.

Never synchronize raw scene nodes. Synchronize stable IDs and domain commands/events.

## LLM and commerce policy

- LLM features generate bounded content for photos and letters; they do not decide inventory, currency, affection, progression, or account state.
- Prompts use structured game context and versioned templates.
- Generated content requires timeout, retry, moderation, fallback, caching, and cost controls.
- Secrets and provider calls stay in Backend.
- Purchases are verified server-side and granted idempotently.
- Paid content must not corrupt or block local saves when a service is unavailable.

## Quality dimensions

Every milestone must address the relevant dimensions:

- Correctness and save integrity.
- Player comprehension and tutorial clarity.
- Input remapping and controller readiness.
- Localization readiness and text expansion.
- Accessibility, readable contrast, motion/audio controls, and non-audio cues.
- Performance on target hardware.
- Deterministic tests and reproducible random behavior.
- Asset licensing and attribution.
- Network loss and service degradation.
- Security and privacy for account, LLM, and commerce data.

Specific numeric budgets belong in accepted decisions or milestone tasks, not scattered constants.

## Definition of done

A feature is complete only when:

- The acceptance criteria and linked evaluation pass.
- The player can enter, use, leave, save, reload, and recover from errors where relevant.
- Content is data-driven and validates at load time.
- Runtime state has a single owner.
- Inputs and user-facing text are configurable/localizable.
- Automated tests cover core rules and regressions.
- Save migrations and network contracts are updated when affected.
- Placeholder assets are clearly marked and replaceable.
- Documentation reflects new terms and decisions.
- No unrelated module or protected project was changed.

## Starting vertical slice

The first playable target is deliberately narrow:

1. Start a local game in one fixed test house selected through data.
2. Move a player in a top-down 2D room and interact through remappable actions.
3. Open inventory and place a workbench.
4. Use the workbench to craft one furniture item from one data-defined recipe.
5. Place that furniture and unlock one data-defined real-life action.
6. Complete the action through a controllable timer and receive a reward.
7. Give or consume the reward through one meaningful branch.
8. Save, quit, reload, and observe the same world state.

Random regions, multiple houses, full first-day story, login, multiplayer, LLM, payments, and production art remain out of scope until this slice passes its evaluation.
