# Testing and Evaluation

Testing protects game rules and save integrity. Evaluations protect the player experience. Both are required.

## Test layers

### Definition validation

Run on every content change. Validate IDs, references, localization, resources, ranges, recipe reachability, event prerequisites, fallback content, and removed IDs used by fixtures.

### Unit tests

Use deterministic tests for rules without rendering scenes:

- Inventory capacity and atomic transactions.
- Recipe visibility, craftability, consumption, and output.
- Furniture placement-rule calculations where separable from physics.
- Action availability, cost, timer state, completion, cancellation, and rewards.
- Hunger/fatigue constraints.
- Pet preferences, affection transitions, needs, and dispatch resolution.
- Event conditions/effects and replay policy.
- Time progression, weather selection, and random tables with fixed inputs.
- Save snapshot validation and migration steps.

### Scene tests

Validate reusable scenes load, required child capabilities exist, signals connect, collision/navigation configuration is present, and missing optional assets fail safely.

### Integration tests

Test feature seams:

- Inventory plus crafting plus save/reload.
- Room plus placement plus navigation/collision.
- Furniture capability plus Action unlock.
- Action completion plus reward transaction plus event trigger.
- Pet request plus item transfer plus affection/event effect.
- Sleep plus day advancement plus queued event.
- Settings/profile separate from World save.
- Network adapter failure leaves local state consistent.

### End-to-end evaluations

Run complete player flows defined under `docs/evals/`. These may combine automated setup/assertions with manual visual and usability checks.

## Determinism requirements

Tests must be able to inject:

- Fixed game, session, real, and network clocks.
- Seeded or scripted random outcomes.
- In-memory save repository.
- Fake Backend/auth/cloud/multiplayer/LLM/commerce adapters.
- Small content catalogs and save fixtures.

Tests should not wait for production-duration timers or depend on external services.

## Save test matrix

Every supported save version requires:

- Valid load.
- Save/load round trip.
- Migration to current version.
- Missing optional fields where supported.
- Unknown or removed definition references.
- Corrupt/truncated file recovery.
- Newer unsupported version behavior.
- Interrupted/failed write preserving last-known-good data.
- Repeated load/save without duplication or drift.

## Top-down 2D test matrix

- Movement in every mapped direction.
- Collision against room and furniture.
- Correct depth ordering above/below entities.
- Interaction chooses the intended nearby target.
- Interaction target changes predictably when candidates overlap.
- Camera remains within room constraints.
- Placement preview matches committed placement.
- Invalid placement cannot block required paths or overlap disallowed geometry.
- Save/reload preserves stable position and placement.
- Resolution/aspect changes do not hide required UI.

## UI and accessibility checks

- Keyboard/mouse navigation and remapped actions.
- Future controller focus path where controls are introduced.
- Long localized text, missing translations, and font fallback.
- UI scaling and supported window sizes.
- Contrast/readability and non-color-only states.
- Important audio events have visual or textual alternatives where appropriate.
- Motion/camera effects respect reduced-motion settings when introduced.
- Errors explain recovery without exposing internal details.

## Audio checks

- Bus controls persist independently.
- Soundscape layers enter and leave without abrupt duplication.
- Multiple furniture/pets respect concurrency limits.
- Muting a bus does not alter gameplay state.
- Missing audio uses silence/fallback without errors.

## Online adapter checks

- Timeout, retry bound, cancellation, and offline fallback.
- Unauthorized and expired sessions.
- Cloud revision conflict preserves both recoverable states.
- Duplicate network messages are idempotent.
- Disconnect during mutation does not duplicate or lose authoritative items.
- LLM timeout/moderation/provider error returns fallback content.
- Purchase retry/webhook duplication does not duplicate entitlements.

## Performance checks

Record budgets only after target platforms are decided. The harness should support measuring:

- Frame time in representative furnished rooms.
- Node and draw-call growth as furniture/pets increase.
- Scene transition and initial load duration.
- Save/load duration and size across long-running fixtures.
- Audio layer count and memory.
- Network latency and message rate in multiplayer fixtures.

Performance work requires a reproducible fixture and measurement before optimization.

## Quality gates

A feature task cannot be completed with only a screenshot or manual statement. It needs the strongest applicable combination of definition validation, automated rule tests, scene/integration checks, and a player-flow evaluation.

Any known failing test must be explained as pre-existing and shown unrelated, or fixed within scope. Do not delete or weaken tests to complete a task.
