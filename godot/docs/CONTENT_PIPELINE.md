# Content and Asset Pipeline

The game depends on a large amount of content. The pipeline must let designers and agents add content without editing generic gameplay logic.

## Content workflow

For each new item, recipe, furniture, pet, event, region, weather type, action, or audio rule:

1. Confirm the concept exists in `CONTEXT.md` or add it.
2. Add or update a validated definition.
3. Add localization keys and fallback text.
4. Add referenced visual/audio assets or approved placeholders.
5. Add focused definition validation.
6. Add a test or evaluation proving the content is reachable and behaves correctly.
7. Check save compatibility if stable IDs or runtime state are affected.

## Definition validation

Validators should catch at least:

- Duplicate or malformed IDs.
- Missing localization keys.
- Missing resource paths.
- References to unknown item, recipe, furniture, pet, event, region, weather, dialogue, or audio IDs.
- Invalid quantities, ranges, or empty reward pools.
- Impossible recipe/station combinations.
- Unreachable event prerequisites and obvious cycles.
- Missing fallback content for external generation.
- Removed IDs still referenced by save fixtures.

Validation should run headlessly and produce errors with definition ID and source path.

## Items and recipes

- Prefer tags/capabilities for reusable rules and exact IDs for intentional unique content.
- Recipe visibility and craftability are separate. A visible recipe may be unavailable and show missing requirements.
- Station inventory queries include only explicitly permitted player/world containers.
- Ingredient consumption and outputs are atomic.
- Balance values live in definitions and are changed through content review, not script edits.

## Furniture and rooms

- Keep feature-specific visuals close to their furniture/room scenes.
- Definitions reference scenes and placement profiles.
- Placement tests cover collisions, invalid surfaces, blocking required paths, pickup, reload, and missing definitions.
- Furniture capabilities determine interactions and action unlocks.
- Decorative assets do not automatically gain gameplay behavior.

## Top-down maps

Before production map work, record decisions for tile/grid size, free versus grid placement, room coordinate conventions, depth sorting, collision layers, navigation layers, and camera framing.

Map source assets and imported Godot resources must be distinguishable. Do not edit generated import files manually.

## Character and pet assets

An asset set may include:

- Base sprite or model source.
- Directional idle, move, interact, action, sleep, need, and reaction animations.
- Collision and interaction shapes.
- Navigation behavior.
- Portraits and dialogue expressions.
- Audio cues.

Gameplay must tolerate missing optional animations by using documented fallbacks rather than failing the feature.

## UI assets

- UI supports localization expansion, scalable windows, and input focus navigation.
- Icons have text/tooltip or accessible meaning where necessary.
- Do not encode user-facing text into textures unless a localized asset pipeline exists.
- Tutorial cues reference mapped actions, not literal keyboard labels.

## Audio pipeline

Organize audio by purpose and license, then map it through data-defined sound events/layers. Expected buses include master, music, ambience, effects, UI, and optional voice/dialogue.

Soundscape rules combine weather, room, time, furniture, pets, cooking, and current Action. Rules select layers; gameplay entities do not each seize global bus control.

Audio content requires:

- Loop and transition metadata.
- Volume/pitch variation policy.
- Simultaneous-instance limits.
- Spatial/non-spatial policy.
- Fallback and mute behavior.
- Attribution/license record.

## Localization

- Internal IDs are language-neutral.
- User-facing text uses localization keys.
- Player-authored Action names and letters remain user content and are stored separately.
- LLM prompts/results declare input/output locale and fallback locale.
- UI evaluations include long-string and missing-translation cases.

## LLM-generated content

Photos and letters use versioned Backend templates with structured context. A generation request should reference safe IDs and bounded summaries rather than upload an unrestricted World save.

Every generated-content feature includes:

- Moderation and privacy rules.
- Timeout/retry limits.
- Cost and rate limits.
- Cache/deduplication key.
- Deterministic fallback content.
- Provenance/status metadata so generated and fallback content can be distinguished.
- No authoritative gameplay reward derived solely from free-form model output.

## Asset licensing

Every external asset requires source, author, license, modification notes, and attribution requirements. Do not add assets with unknown redistribution rights. Generated assets require provider/model provenance and a review status appropriate to the intended distribution platform.

## Placeholder policy

Placeholders are allowed to unblock a vertical slice when:

- They are clearly named or tagged as placeholders.
- Their dimensions and interface match the intended replacement.
- Tests do not depend on placeholder-specific visuals.
- Replacement is tracked as a separate content task.

## Content review checklist

- Stable ID and references validate.
- Player-facing text is localizable.
- Asset/license metadata exists.
- Definition can be discovered or unlocked.
- Behavior uses existing capabilities or introduces a documented new capability.
- Save migration is addressed for renamed/removed IDs.
- Offline behavior works.
- Multiplayer and external-service policy is explicit, even if out of scope.
