# Evaluation Harness

Evaluations describe complete observable flows. They complement unit and integration tests by checking that a player can understand and finish the intended experience.

An evaluation may be automated, manual, or hybrid. It must specify setup, controls, observations, assertions, failure evidence, and cleanup.

## Evaluation categories

- Core loop: action, reward, spending, and progression.
- Save integrity: save, quit, reload, migration, corruption recovery.
- Top-down interaction: movement, collision, targeting, placement, camera.
- First-day onboarding: tutorial clarity and event progression.
- Accessibility/localization: remapping, text expansion, audio alternatives.
- Degraded service: offline, timeout, conflict, moderation fallback.
- Multiplayer: authority, disconnect, duplicate prevention, reconciliation.
- Performance: representative room/save/network fixtures.

Use `TEMPLATE.md` for each evaluation. A milestone exit should link to one or more evaluation files.
