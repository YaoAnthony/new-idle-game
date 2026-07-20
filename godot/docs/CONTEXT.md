# Domain Context

Use these terms consistently in code, tasks, data definitions, tests, and documentation.

## Product language

### World

A durable save-owned magical living environment. A World contains its region, house, rooms, placed furniture, storage, time, weather, pets, events, mail, and progression.

### Player Profile

Player-level preferences and metadata that are not part of a specific World. It may later bind to an authenticated account, but local play does not require identity.

### Session

Temporary runtime context for one local or multiplayer play period. A Session is not automatically durable state.

### Region

A broad environmental theme that influences available house variants, weather, pets, resources, ambience, and future destinations.

### House

The player's home within a World. It contains one or more Rooms and owns house-level progression such as expansion and wallpaper.

### Room

A top-down 2D playable area with collision, navigation, placement surfaces, interaction anchors, audio context, and environmental conditions.

### Item Definition

Immutable content describing an item ID, category, tags, stack behavior, icon, quality/expiration policy, and capabilities.

### Item Stack

Runtime ownership of an item definition, quantity, and optional per-stack state such as quality or expiration.

### Inventory

A container that owns Item Stacks and exposes capability-based queries and transactions. Player backpacks and furniture storage are both inventories.

### Furniture Definition

Immutable content describing footprint, placement rules, visuals, interactions, storage, audio, station capability, and action unlocks.

### Placed Furniture

A durable World entity with a stable instance ID, furniture definition ID, room ID, transform, and feature-specific state.

### Station

A furniture capability that performs a process, such as crafting, cooking, cutting, rice cooking, bread making, composting, or daily-task generation.

### Recipe

A data-defined transaction requiring inputs, a station capability/level, optional unlock conditions, and one or more outputs.

### Action

A player-created or predefined real-life timed activity. Every Action belongs to Exercise, Work/Study, Creation, or Rest and declares requirements, costs, timer semantics, and rewards.

### Need

A constrained runtime value or request that affects behavior. Player hunger and fatigue are Needs; a pet's desired food or companionship can also be a Need, but each has a distinct owner.

### Pet Definition

Immutable content describing species-level preferences, behaviors, growth, audio, possible needs, and dispatch rules.

### Pet

A durable individual World entity with identity, memory, affection stage, needs, growth, location, and dispatch state.

### Affection Stage

A hidden relationship state expressed through behavior. Current stages are Stranger, Familiar Resident, Life Companion, and Family. Displayed numerical affection is not part of the design.

### Event Definition

Immutable content defining prerequisites, scheduling, branching, effects, replay policy, and multiplayer policy.

### Event Instance

A queued, active, completed, or dismissed occurrence of an Event Definition in a World.

### Unlock

A durable capability granted by progression. Unlocks should reference stable capability IDs rather than UI elements or scene paths.

### Daily Task

A generated repeatable objective unlocked by the repaired daily-task machine. It is distinct from a player-created real-life Action.

### Dispatch

A pet journey with a destination, provisions, departure time, return time, conditions, and generated results.

### Weather

A World or Region environmental state that influences visuals, sound, pet behavior, dispatch results, and events.

### Soundscape

A layered audio result derived from room, weather, time, furniture, pets, and current player Action.

### Save Snapshot

A versioned serializable representation of Player Profile or World state. It contains stable IDs and data, not live Nodes.

## State ownership

| State | Owner | Persistence |
| --- | --- | --- |
| Accessibility, audio, language, input mappings | Player Profile or settings | Local; optionally cloud later |
| Region, house, rooms, placed furniture | World | World save |
| Inventory and storage contents | Owning World entity | World save |
| Day, game time, weather | World | World save |
| Pet identity, memory, affection, dispatch | World | World save |
| Event and unlock progress | World | World save |
| Current menu, hover, transient animation | Session/UI | Not durable |
| Auth token, connection, multiplayer membership | Session/infrastructure | Secure temporary storage as appropriate |
| Static items, recipes, pets, events | Content definitions | Project data, not save duplication |

## Required distinctions

- Action is not Daily Task.
- Player Profile is not World.
- Item Definition is not Item Stack.
- Pet Definition is not Pet.
- Event Definition is not Event Instance.
- Save Snapshot is not a live scene tree.
- Session state is not durable progression.
- Local save and cloud save are adapters of the same persistence seam, not separate gameplay systems.
