# Idle Game Features

Feature folders hold domain-specific gameplay rules and adapters. New feature
work should prefer these folders over adding more logic to `GameSceneRuntime`,
`GameSceneBootstrap`, or generic `systems/`.

- `farming/`: crop catalog, farm rules, tile view adapters, growth behavior.
- `npc/`: NPC catalog, knowledge, memory, needs, schedule, thinking, dialogue.
- `housing/`: current-map house placement, construction, contracts, doors.
- `building/`: placed object authority, behavior registry, placement, upgrade/repair, and runtime mirrors.
- `storage/`: storage chest contents, modal interaction, and transfer behavior. Placement is owned by `building/`.
- `transport/`: bus and vehicle runtime behavior driven by Tiled route metadata.
- `creatures/`: animal and nest lifecycle systems.
- `pets/`: companion animal definitions, lifecycle, needs, memory, interaction, behavior, and save state.

Path terrain, fence collision, bed sleep/light behavior, and storage chest
placement now live under `building/behaviors/**`; the old standalone system
folders were removed after the migration.

The old generated event/storyline runtime and old room interiors have been
removed. Do not add new gameplay to those deleted stacks.
