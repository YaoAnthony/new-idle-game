# Data Model and Persistence

This document defines ownership and extensibility. It intentionally avoids inventing balance values or complete schemas before their implementation tasks.

## Three kinds of data

### Content definitions

Immutable authored data shipped with or downloaded for the game. Examples: item definitions, recipes, furniture definitions, pet species, events, weather, regions, dialogue references, and audio rules.

Definitions use stable language-neutral IDs. Saved state references these IDs.

### Runtime state

Mutable state in the active game: quantities, positions, current day, pet memories, completed events, and active actions.

### Presentation state

Temporary state such as open panels, selected tabs, hover targets, animation progress, and camera transitions. It is not saved unless a specific user experience requires it.

## ID policy

- IDs are stable, unique within their type, lowercase, and language-neutral.
- Display names and localization keys may change without changing IDs.
- Runtime entities use generated stable instance IDs where individual identity matters.
- Renamed or removed definition IDs require aliases or migration.
- Scene node paths and array indexes are not durable IDs.

Example ID shapes are illustrative only:

```text
item.wood
recipe.basic_table
furniture.workbench.basic
pet_species.forest_cat
event.first_day.pet_returns
region.forest
```

## Content definition families

### Item Definition

Expected concepts:

- ID and localization keys.
- Category and tags.
- Stack and uniqueness policy.
- Icon/visual references.
- Quality and expiration policy.
- Usable, edible, placeable, ingredient, currency, quest, or key-item capabilities.
- Sell/discard/trade restrictions where relevant.

### Recipe Definition

Expected concepts:

- ID and localization keys.
- Station capability and minimum station level.
- Ingredient requirements by exact ID, category, tag, quality, or condition.
- Outputs and quantities.
- Unlock and visibility conditions.
- Processing mode and timing reference.
- Quality rules and failure behavior.

### Furniture Definition

Expected concepts:

- ID and localization keys.
- Scene/visual reference.
- Footprint and placement constraints.
- Collision and navigation behavior.
- Pickup, rotation, ownership, and multiplayer permission rules.
- Capabilities such as storage, station, bed, action unlock, ambience, or decoration.
- Persistent feature-state schema where needed.

### Action Definition

Expected concepts:

- ID and category.
- Furniture/capability requirements.
- Duration constraints or presets.
- Fatigue/hunger costs.
- Reward table and guaranteed first-time rewards.
- Start, interruption, cancellation, completion, and offline policies.
- Animation and soundscape tags.

Player-created Action state references an Action Definition or category and stores sanitized player-entered text separately.

### Pet Definition

Expected concepts:

- Species ID and visuals.
- Need and behavior pools.
- Food and weather preferences.
- Affection-stage thresholds and behavior unlocks.
- Dispatch destinations/results.
- Growth rules.
- Audio and animation references.

### Event Definition

Expected concepts:

- ID, priority, replay policy, and multiplayer policy.
- Conditions based on time, weather, items, furniture capabilities, pet state, choices, and prior events.
- Steps such as dialogue, camera cue, movement request, reward, state mutation, choice, unlock, wait, and scene transition.
- Completion, cancellation, skip, and recovery effects.

### Region and House Definitions

Expected concepts:

- Region ID, environment, weather table, content pools, and ambience.
- House ID, compatible region IDs, room scenes, anchors, starting inventory pool, pet encounter pool, and initial event set.

## Runtime state families

### Player Profile

Contains settings and metadata not owned by a World:

- Profile/save-slot metadata.
- Accessibility, language, audio, and input preferences.
- Optional account binding and cloud revision metadata.
- Entitlement references when online commerce is introduced.

Sensitive tokens do not belong in ordinary profile saves.

### World State

Contains durable progress:

- World instance ID and version metadata.
- Region and house definition IDs.
- Day, game time, and weather.
- Player state and World-owned inventories.
- Rooms and placed furniture.
- Pets and dispatches.
- Active/completed actions and daily tasks.
- Event queue, history, choices, and unlocks.
- Mail, photos, recipes discovered, and content-specific progression.

### Session State

Contains temporary state:

- Current mode and active World reference.
- UI navigation and local interaction focus.
- Multiplayer room membership, peers, pending commands, and connection status.
- In-flight Backend operations.

Only intentionally durable information is promoted into Player Profile or World State.

## Save envelope

Every durable file or cloud document requires conceptual metadata:

- Format version.
- Game/content version.
- Save kind: profile or world.
- Stable save/world ID.
- Created and updated timestamps from an explicit clock.
- Payload.
- Optional integrity/checksum metadata.
- Optional cloud revision/conflict metadata.

The concrete schema belongs in `/contracts/save_schema.json` when the save implementation task begins.

## Save rules

- Build snapshots from runtime state; do not serialize live Nodes blindly.
- Validate before writing and after reading.
- Write atomically and keep a recoverable backup.
- Never overwrite a readable save with invalid state.
- Save after durable milestones and on safe exit, using debounce to avoid excessive writes.
- Record whether an in-progress action resumes, pauses, completes offline, or cancels. This is unresolved until a focused decision.
- Store unknown extension data only if a compatibility strategy explicitly supports it.

## Migration rules

Each save-shape change must include:

1. Old fixture.
2. Migration implementation.
3. Expected new fixture or assertions.
4. Idempotency check.
5. Failure/recovery behavior.
6. Documentation of the oldest supported version.

Migrations run in ordered steps rather than one unversioned compatibility function.

## Inventory transactions

Any transfer, crafting, cooking, reward, trade, or consumption operation is atomic:

1. Resolve relevant inventories.
2. Validate definitions, quantities, capacity, quality, ownership, and permissions.
3. Build a transaction plan.
4. Apply all removals and additions.
5. Emit one result and schedule persistence.

On failure, no partial mutation remains.

## Time model

Every time-dependent definition declares its clock semantics:

- Game clock advances with gameplay/day simulation.
- Real clock uses elapsed wall time.
- Session clock advances only while the app/session runs.
- Network clock is authoritative for online deadlines.

Code must not mix these clocks implicitly. Tests inject fixed time.

## Randomness model

Region selection, house selection, loot, weather, pet dispatch, daily generation, and event variation consume named random streams or an injected seeded source. The result should be reproducible from test fixtures and diagnosable from development logs without exposing private data.

## Shared contracts

- `/contracts/save_schema.json`: save envelope and shared serialization contract when implemented.
- `/contracts/api_schema.yaml`: Backend HTTP contract when implemented.
- `/contracts/multiplayer_protocol.md`: commands, events, authority, revisions, and reconciliation when implemented.

Do not duplicate a contract in prose and code without declaring which representation generates or validates the other.
