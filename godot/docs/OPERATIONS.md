# Build, Release, Security, and Operations

This document defines the concerns every production-bound task must consider. Concrete platform commands are added after target platforms and deployment environments are selected.

## Environments

Maintain explicit development, test/staging, and production configurations. Service URLs, feature availability, logging, analytics, and credentials are environment-owned configuration, never gameplay constants.

The Godot client contains no reusable production secrets. Backend environment files are not committed except documented examples without real values.

## Versioning

Track independently where needed:

- Game/client version.
- Save format version.
- Content catalog version.
- HTTP API version.
- Multiplayer protocol version.
- LLM prompt/template version.

A release records compatibility expectations among these versions.

## Build reproducibility

- Pin engine, dependency, and addon versions.
- Keep export presets and platform requirements documented when introduced.
- Generate builds from a clean checkout in CI before release.
- Validate that generated/import/cache directories are not treated as source.
- Produce checksums and release notes for distributable artifacts.

## Release gate

A release candidate requires:

- Full automated validation.
- First-launch, new-game, continue, save, reload, settings, and safe-exit smoke tests.
- Supported save migration tests.
- Representative performance checks.
- Missing-network/external-service checks where relevant.
- Localization and accessibility smoke tests.
- License/attribution review for new assets.
- Privacy/security review for new data collection or external content.
- Rollback and last-known-good build plan.

## Security ownership

Backend is authoritative for authentication, account access, cloud-save authorization, multiplayer permissions, LLM providers, purchases, and entitlements.

Required practices when those features are introduced:

- Validate and rate-limit all untrusted input.
- Use secure session/token storage appropriate to the platform.
- Apply least-privilege access to Worlds and generated content.
- Make purchase and reward operations idempotent.
- Avoid trusting client timestamps, inventory, currency, or entitlements.
- Redact secrets and personal content from logs.
- Define abuse reporting/moderation before public social text features.

## Privacy

Before collecting account data, analytics, crash reports, player-authored letters, photos, prompts, or generated outputs, document:

- Purpose and lawful/consent basis as applicable.
- Data fields and whether they are optional.
- Storage location and retention.
- Third-party processors.
- Deletion/export behavior.
- Age/region restrictions.
- Logging and support access.

Do not upload a complete World save to an LLM provider. Backend must construct the smallest bounded context needed.

## Telemetry and diagnostics

Development diagnostics should support reproduction without collecting unnecessary personal content. Use stable event names, versions, error categories, and correlation IDs. Production telemetry is opt-in/configurable according to future privacy decisions.

Useful operational signals include:

- Crash-free sessions.
- Save/load/migration failures.
- Corrupt-save recovery.
- Scene load and frame-time distributions.
- Network errors and cloud conflicts.
- LLM latency/fallback/moderation rates and cost.
- Purchase verification failures and duplicate prevention.

Telemetry does not replace tests and must not silently change gameplay.

## Backup and recovery

- Local saves preserve a last-known-good copy.
- Cloud saves retain revision/conflict metadata according to a future retention decision.
- Migrations never destroy the only readable original.
- Support tooling must avoid exposing private player content.
- Recovery instructions are tested before release, not invented after data loss.
