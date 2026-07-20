# Product Specification

## Vision

Create a cozy top-down 2D magical-life game where real-life focus actions create visible in-game progress. The player rents a home, completes timed actions, receives resources, cares for pets, cooks, crafts furniture, decorates, and gradually unlocks a wider world.

The game should support quiet companionship through music, environmental sound, pets, and optional social play. Progress should feel personal rather than competitive.

## Core experience pillars

### Real-life action becomes game progress

The player creates or selects an action in one of four categories:

- Exercise.
- Work or study.
- Creation.
- Rest.

Available actions depend on furniture and unlocked capabilities. Completing an action consumes time and relevant needs, then grants data-defined rewards.

### Home grows with the player

Resources can be used to survive, craft furniture, unlock actions, decorate, create soundscapes, grow plants, expand the home, and gain travel options.

### Pets are relationships, not meters

Pets have needs, preferences, memories, affection stages, behaviors, dispatch choices, and growth. Exact affection numbers are not shown to the player; relationship changes are communicated through behavior and events.

### Quiet social presence

Future multiplayer allows visiting a host-owned world, seeing each other's activities, using permitted stations and furniture, contributing to shared daily progress, and earning friendship rewards. Main story progression is disabled during multiplayer by default.

## Core loop

```text
Choose an available real-life action
  -> spend game time, fatigue, and hunger as defined
  -> receive resources
  -> spend resources on survival, pets, crafting, or decoration
  -> unlock new capabilities, relationships, and events
  -> repeat across days
```

## Presentation and controls

- The initial game is top-down 2D.
- The player moves through room-scale environments and interacts with nearby objects.
- Inventory, interaction, placement, and action controls must use Godot InputMap actions and support remapping.
- Current design references `B`, `F`, left click, and right click as defaults only; gameplay logic must not depend on those physical keys/buttons.
- Camera behavior, collision, navigation, depth sorting, and interaction range require data/configuration rather than magic values.

## First-day target experience

The complete first-day experience is a later milestone built from smaller vertical slices:

1. The player receives one of several starting regions and house variants.
2. The player opens the inventory and places starting furniture.
3. Placing and interacting with the workbench introduces crafting.
4. The player encounters a pet and learns its initial need.
5. Furniture unlocks one or more action categories.
6. Completing actions grants story-critical and general resources.
7. A reward can be given to a pet, used for crafting, or consumed.
8. Cooking introduces food, hunger recovery, utensils, stations, timing, and quality.
9. The player completes several actions, reaches night, and sleeps on starting bedding.
10. The next day, the pet returns with a gift and the mother calls about the daily-task machine.
11. The game enters its repeatable home-life loop.

This sequence must be represented as data-driven progression and event definitions, not a single monolithic tutorial script.

## Required gameplay systems

### Foundation

- App startup, local new game, continue game, settings, and safe exit.
- Top-down movement, collision, camera, interaction targeting, and scene transitions.
- Input mapping, localization, accessibility settings, audio buses, and error presentation.

### World and home

- Regions and house variants.
- Room anchors, placement surfaces, collision, navigation, and valid furniture footprints.
- Furniture pickup, preview, rotation if supported, placement, interaction, persistence, and storage capability.
- Future wallpaper, expansion, renovation, weather, and travel unlocks.

### Inventory and crafting

- Data-defined items, categories, stacks, tags, quality, expiration, and ownership.
- Player inventory and world storage containers.
- Crafting stations query permitted inventories through an explicit inventory interface.
- Recipes define inputs, outputs, station type/level, visibility, unlocks, and failure reasons.
- Missing requirements are visible and cannot produce partial or duplicated transactions.

### Real-life actions

- Four action categories with data-defined requirements and outcomes.
- User-created action names and durations.
- Start, pause/interruption policy, completion, cancellation, and recovery after application exit.
- Furniture-based availability.
- Fatigue and hunger constraints.
- Rewards and first-time story guarantees.

### Time, needs, and sleep

- Game day and time progression.
- Fatigue consumption and recovery.
- Hunger consumption, food recovery, and action blocking at minimum hunger.
- Sleep advances the day and can trigger queued events.
- Real-time and game-time semantics must be explicit for every timer.

### Pets

- Species and individual identity.
- Needs, preferences, incompatible foods, weather preferences, and memory.
- Hidden affection progression expressed through stages and behavior.
- Dialogue and event interactions.
- Dispatch destination, provisions, duration, result, and return event.
- Growth value initially; evolution behavior remains deferred.

### Cooking and food

- Station capabilities such as stove, cutting board, rice cooker, bread maker, and plate.
- Ingredient compatibility, recipe discovery, process steps, timing, quality, serving, and consumption.
- Quality may degrade from poor timing, but rare materials must not be destroyed without an explicit design decision.
- Food expiration and prepared-meal behavior require a dedicated later decision.
- Future pet cooking delegation depends on unlocked recipes and pet capability.

### Events and progression

- Conditions based on day, weather, inventory, furniture, pet state, prior events, and player choices.
- Effects such as dialogue, rewards, state changes, unlocks, camera cues, weather, and new capabilities.
- One-time, repeatable, queued, mutually exclusive, and multiplayer-disabled policies.
- Initial unlock events include the damaged daily-task machine and rescuing Dahe for travel/social access.

### Daily tasks

- Unlocked through the repaired daily-task machine.
- Rewards may include address fragments, stamps, weather bottles, film, photo paper, fuel, and travel tickets.
- Daily reset, generation, completion, and offline recovery semantics require explicit definitions.

### Plants and compost

- Pots, seeds, growth, fertilizer, and environmental conditions.
- Expired food may become fertilizer through a compost station.
- Station placement may require a separate area because of smell constraints.
- Fertilizer and food have data-defined quality/level relationships.

### Dynamic soundscape

- Layered ambience depends on weather, furniture, pets, player action, room, and time.
- Examples include rain, wind, fire, water, chimes, ticking clocks, cooking, pet movement, study, exercise, and creation sounds.
- Layers must be independently adjustable and respect master, music, ambience, effects, and accessibility settings.

## Deferred online and external systems

### Account and cloud save

Local play comes first. Login is required only for identity-dependent services such as cloud saves, friends, multiplayer, purchases, and cross-device access. Guest-to-account migration must preserve local worlds.

### Multiplayer

- Host-owned world session.
- Explicit visitor permissions and authority.
- Shared daily-task contribution and friendship stamps.
- No main-story progression by default.
- Disconnect, conflict, rollback, and session-finalization policies are required before implementation.

### LLM photos and letters

- Photos and letters are generated from bounded event context.
- Generation is cosmetic/narrative and cannot directly grant authoritative rewards.
- Backend owns prompts, credentials, moderation, retries, fallback content, caching, and cost controls.

### Commerce

- Potential products include magic wands, wallpaper, and cosmetic content.
- Purchases require authenticated, idempotent server verification and platform-compliant restore behavior.
- Commerce is not part of the first playable milestones.

## Non-functional requirements

- Offline-first core loop.
- Versioned, recoverable, atomic local saves.
- Data-driven content and stable IDs.
- Deterministic tests through injectable time and randomness.
- Keyboard/mouse initially, with input abstraction ready for controller support.
- Localization-ready UI and content from the start.
- Audio controls and non-audio feedback for important states.
- Clear degraded behavior when Backend, network, LLM, or commerce services are unavailable.
- No client-side secrets or authoritative purchase logic.
- Asset attribution and licensing records.
- Performance budgets recorded per target platform before optimization work.

## First playable scope

The first playable scope includes one data-selected test house, player movement, interaction, inventory, workbench placement, one recipe, one furniture unlock, one timed action, one reward branch, local save, reload, and error handling.

It excludes production art, random starting regions, the complete first-day narrative, login, cloud save, multiplayer, LLM, commerce, full cooking, full pets, and all content breadth.

## Open product questions

These require future tasks or decisions rather than assumptions in code:

- Target desktop platforms and minimum hardware.
- Pixel-art, hand-painted, or other visual direction.
- Tile/grid size, free placement versus snapped placement, and rotation rules.
- Whether action timers continue while the app is closed.
- Pause and cancellation consequences for real-life actions.
- Exact hunger, fatigue, food expiration, and day-length balance.
- Save-slot count and guest-to-account merge behavior.
- Multiplayer authority host versus dedicated server.
- Moderation, privacy, and retention rules for generated letters/photos.
- Monetization platform and restore/refund policy.
