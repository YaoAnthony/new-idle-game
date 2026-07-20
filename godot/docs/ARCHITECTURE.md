# Architecture

## System context

```text
Player
  -> Godot client
       -> local definitions and local save
       -> Backend adapter when online features are used
            -> identity and cloud saves
            -> multiplayer sessions
            -> LLM generation
            -> commerce verification
```

The Godot client owns the complete offline gameplay loop. Backend services are optional adapters until a feature explicitly requires identity or shared authority.

## Dependency direction

```text
Scenes and UI
  -> feature interfaces
       -> runtime state and content definitions
            -> infrastructure interfaces
                 -> local or remote adapters
```

Dependencies do not point upward. Static data does not depend on scenes. Runtime state does not call UI. Feature rules do not open files or issue HTTP requests. Infrastructure adapters do not decide rewards, progression, affection, or crafting outcomes.

## Top-level Godot ownership

### `app/`

Owns bootstrap, the root scene, scene transitions, lifecycle, pause, shutdown, and composition of the active World and UI.

The intended root SceneTree shape is conceptual rather than a required node-name contract:

```text
Main
├── WorldHost
│   └── ActiveWorld
├── SessionSystems
└── GUI
```

Features must not find these nodes through hardcoded absolute NodePaths. Composition provides dependencies or uses explicit signals/interfaces.

### `features/`

Owns player-visible gameplay behavior. Each feature directory keeps scenes, scripts, local assets, feature tests, and optional feature documentation close together.

A feature may contain:

```text
feature_name/
├── feature_scene.tscn
├── feature_scene.gd
├── feature_rules.gd
├── definitions/
├── assets/
└── tests/
```

Do not create every subdirectory in advance. Add them when a task creates real content.

### `data/`

Owns immutable content definitions and catalogs. Definitions may be Godot Resources for editor-authored content or validated JSON when sharing/remote delivery is required. A decision must establish the format before a content family is implemented.

### `state/`

Owns serializable runtime state shapes and invariants. State objects are not generic global managers. They contain durable data and focused domain operations, not rendering, file access, or network code.

### `infrastructure/`

Owns adapters for persistence, Backend calls, authentication, multiplayer transport, audio devices, analytics, and platform services.

### `ui/`

Owns cross-feature menus, HUD, dialogs, reusable widgets, focus navigation, accessibility presentation, and view-only state. Feature-specific UI may remain inside its feature when it has no cross-feature reuse.

### `tests/`

Owns cross-feature integration tests, shared fixtures, save fixtures, and complete flow tests. Feature-local unit tests may live next to the feature.

## Transitional directories

The repository currently contains earlier placeholder directories such as `/Core/`, `/TileMap/`, `godot/scene/`, and `godot/scripts/`. They are not part of the accepted feature-first architecture. Do not add new production behavior there and do not delete or move them opportunistically. A focused migration/cleanup task must first identify ownership and preserve any user-created content.

## Autoload policy

An Autoload is justified only when all are true:

- It must exist across scene transitions.
- It has one global owner.
- Its public interface is small and stable.
- Tests can replace or reset it.
- It does not become a miscellaneous dependency container.

Potential uses include application lifecycle, active-profile/world coordination, save orchestration, audio bus coordination, and scene routing. Inventory, pets, crafting, cooking, events, and furniture are not automatically Autoloads; they should normally belong to the active World or a feature scene.

## Scene and node design

- Use scenes for reusable visual/physical entities and composed behavior.
- Use RefCounted/data objects for rules and state that do not need SceneTree lifecycle.
- Use Resources for immutable editor-authored definitions when appropriate.
- Prefer composition and capabilities over deep inheritance trees.
- Signals announce completed facts or requests across a seam; they do not replace clear state ownership.
- Node names use PascalCase; files and directories use snake_case.
- Avoid fragile `get_parent()` chains, absolute NodePaths, and string-based method dispatch for core behavior.

## Top-down 2D world

The world module must account for:

- Movement and collision independent from animation.
- Interaction detection and deterministic target selection.
- Y/depth ordering for player, pets, and furniture.
- Camera constraints, room bounds, transitions, and event cues.
- Navigation for pets and future visitors.
- Placement validation against footprint, surfaces, collisions, access paths, and room rules.
- Spawn anchors and stable placed-entity IDs.
- Tile-based or free-form map authoring selected by a recorded decision.

Art coordinates, physics layers, navigation layers, tile sizes, interaction ranges, and camera values belong in project configuration, definitions, or exported properties rather than duplicated literals.

## Gameplay modules

### Player

Translates mapped input into movement and interaction intent. It owns current controllable-character state but not World inventory, crafting, or save behavior.

### Interaction

Uses capability queries such as interactable, placeable, storage, crafting station, cooking station, bed, pet, or pickup. New interactable content should not require editing a central switch statement.

### Inventory

Provides atomic transactions over one or more inventories. Crafting and cooking first build a transaction plan, then consume inputs and grant outputs as one operation. Failed operations leave all inventories unchanged.

### Furniture

Separates a Furniture Definition from a Placed Furniture entity. Placement uses preview, validation, confirmation, cancellation, and persistence. Furniture exposes capabilities rather than content-name checks.

### Workbench and cooking

Both are station-process features sharing transaction concepts without forcing identical workflows. A Recipe declares requirements and outputs; each station feature owns timing, quality, interaction, and presentation.

### Actions

Owns user-created action metadata, availability, timer semantics, need costs, completion, cancellation, and rewards. A clock seam makes action behavior deterministic and supports a later decision on offline progress.

### Pets

Owns individual pet state and behavior policy. Pathfinding/animation render intent, while need, affection, preference, memory, dispatch, and event rules remain deterministic and testable.

### Events

Evaluates data-defined conditions and applies data-defined effects through registered capabilities. Event progression is resumable and persisted. Long cutscenes must support safe skip/recovery policy before production use.

### Soundscape

Resolves desired layers from World state and sends mixing intent to the audio adapter. It must avoid every furniture/pet directly controlling global audio buses.

## State change model

Use explicit commands and resulting domain events conceptually:

```text
Player intent
  -> validate command
  -> apply atomic state change
  -> emit domain event
  -> update presentation
  -> schedule autosave when durable
```

Examples include `place_furniture`, `craft_recipe`, `start_action`, `complete_action`, `give_item_to_pet`, and `sleep_until_next_day`. Exact types are implementation decisions, but every durable mutation needs a named, testable path.

## Persistence architecture

```text
Feature state
  -> Save Snapshot builder
  -> Save Repository
       -> Local Save Adapter
       -> Cloud Save Adapter later
```

Requirements:

- Versioned envelope and content version.
- Stable IDs for definitions and runtime entities.
- Atomic write through temporary file and replacement where supported.
- Last-known-good backup.
- Schema validation and useful errors.
- Migration from supported older versions.
- Rejection or read-only recovery for unsupported newer versions.
- Separate settings/configuration from World saves.
- Explicit autosave triggers and debounce policy.
- Fixtures for migration and corrupted-save tests.

## Backend architecture boundary

Godot communicates through versioned contracts under `/contracts/`. Backend owns:

- Account identity and secure sessions.
- Cloud save storage, revisioning, conflict metadata, and quotas.
- Multiplayer room lifecycle and authoritative mutations as selected later.
- LLM prompts, safety, generation, caching, and cost controls.
- Purchase verification and idempotent entitlement grants.

The Godot client owns optimistic UI and offline behavior but cannot be trusted for currency, purchases, online rewards, or access control.

## Failure behavior

Every adapter exposes useful failure categories such as unavailable, timeout, unauthorized, conflict, invalid data, quota, unsupported version, and unknown error. Feature/UI layers translate them into player-safe outcomes.

Required recovery patterns include:

- Retry with bounds for transient operations.
- Cancel and return to a stable state.
- Offline continuation when valid.
- Preserve local data during cloud conflict.
- Fallback text/image for LLM failure.
- No duplicate grant after retried crafting, rewards, saves, or purchases.

## Performance and observability

- Avoid per-frame polling when events or timers suffice.
- Pool or batch repeated visual/audio effects only after measurement.
- Track scene load time, save/load duration, active nodes, memory, frame time, network latency, and adapter error categories in development builds.
- Logs use categories and stable event names; do not log secrets, tokens, personal text, or full generated prompts in production.
- Performance budgets must be defined after target platforms are selected.
