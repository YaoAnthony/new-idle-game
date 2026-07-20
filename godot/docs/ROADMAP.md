# Dependency-Ordered Roadmap

This roadmap describes delivery order, not calendar dates. Each milestone is broken into independently executable task files before implementation.

## M0: Harness and decisions

Outcome: Agents share product language, architecture constraints, task format, and validation expectations.

- Review and accept the Harness documents.
- Resolve target platform and initial art/map authoring decisions needed by M1.
- Select the Godot test framework and headless validation commands.
- Decide initial content-definition format.
- Add project ignore/export/development configuration tasks.

Exit criteria: an implementation task can state exact commands, dependencies, and acceptance criteria without inventing architecture.

## M1: Top-down 2D foundation

Outcome: A local application starts in one test room and supports reliable movement and interaction.

- App root and scene composition.
- InputMap actions and remapping-ready input.
- Test room, player movement, collision, depth sorting, and camera.
- Interaction target selection and one test interactable.
- Settings/profile separation and audio bus skeleton.
- Headless project/scene checks and baseline diagnostics.

Exit criteria: the player can enter a test room, move, collide, target one object, interact, pause, and exit without errors.

## M2: First core-loop vertical slice

Outcome: One complete action-to-reward-to-save loop is playable.

- Minimal item definitions and inventory transaction module.
- Furniture definition and placement flow.
- Basic workbench capability and one recipe.
- One crafted furniture item unlocking one Action.
- Action timer through injectable clock.
- Hunger/fatigue fields only to the extent required by the slice.
- One reward branch.
- Versioned local World save, backup, load, and corruption handling.
- First playable evaluation.

Exit criteria: start, place workbench, craft/place furniture, complete Action, use reward, save, quit, reload, and observe consistent state.

## M3: First-day narrative slice

Outcome: The designed first-day onboarding is playable with narrow content breadth.

- Data-driven event sequencing and tutorial cues.
- Starting region/house selection through seeded definitions.
- Initial pet encounter, need, dialogue, gift, and hidden affection stage.
- Expanded Action categories and guaranteed progression rewards.
- Minimal cooking flow, hunger recovery, and food consumption.
- Sleep, next-day progression, pet return, and mother call.
- Daily-task machine unlock state, without full daily content breadth.

Exit criteria: a new player can complete the first day, understand the core loop, save/reload at supported checkpoints, and enter the repeatable home loop.

## M4: Sustainable home loop

Outcome: The game supports repeated days and content expansion without new generic code for every definition.

- Multiple items, recipes, furniture capabilities, and all four Action categories.
- Storage inventories and station queries.
- Expanded cooking, quality, and explicit expiration policy.
- Weather and dynamic soundscape.
- Pet needs, behaviors, dispatch, and growth.
- Plants, pots, compost, and fertilizer.
- Daily-task generation and reward economy.
- House decoration and expansion foundations.
- Balance/content validation tools.

Exit criteria: multiple in-game days remain understandable, recoverable, and economically functional under save/load and content validation.

## M5: Identity and cloud

Outcome: Local players can optionally bind identity and synchronize Worlds.

- Account/auth contract and Backend implementation.
- Login/account UI in Godot only as required by online features.
- Guest-to-account migration.
- Cloud save revisions, conflict resolution, quotas, and recovery.
- Friends/profile prerequisites.

Exit criteria: local play remains available; authenticated players can upload/download without silent data loss.

## M6: Multiplayer visits

Outcome: A host can open a World and a friend can visit under explicit permissions.

- Authority and reconciliation decision.
- Versioned multiplayer command/event protocol.
- Room/session lifecycle and reconnect behavior.
- Host World upload/start/finalization.
- Visitor movement, presence, permitted furniture/station use, and pet dialogue.
- Shared daily progress and friendship stamps.
- Story progression disabled by policy.
- Network-loss, duplication, and conflict evaluations.

Exit criteria: supported mutations remain consistent across disconnect/reconnect and cannot duplicate inventory or rewards.

## M7: Narrative generation and commerce

Outcome: Optional external features add value without controlling core progression.

- Camera/photo capture context and LLM image/narrative pipeline.
- Letter generation and response workflow.
- Moderation, privacy, fallback, caching, and cost controls.
- Commerce platform decision, catalog, entitlement, verification, restore, refund, and offline behavior.

Exit criteria: external failures degrade gracefully; authoritative rewards and saves remain valid; privacy/security review passes.

## Dependency rule

Do not start a later milestone because its folder exists. A later task may begin only when its direct dependencies and required decisions are complete, or when the task explicitly defines a disposable prototype that cannot enter production code.
