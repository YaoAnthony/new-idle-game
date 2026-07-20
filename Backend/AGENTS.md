# Backend Agent Instructions

Backend exists to support optional online and authoritative capabilities. It does not own the offline gameplay loop.

## Required context

Read the repository `AGENTS.md`, `godot/HARNESS.md`, relevant sections of `godot/docs/SPEC.md`, `godot/docs/ARCHITECTURE.md`, `godot/docs/DATA_MODEL.md`, `godot/docs/OPERATIONS.md`, and the assigned task.

## Ownership

Backend may own:

- Authentication, authorization, account binding, and secure sessions.
- Cloud-save storage, revisions, conflicts, quotas, and recovery.
- Multiplayer rooms, authority, validation, and reconciliation.
- LLM prompts, provider credentials, moderation, fallback, caching, and cost controls.
- Purchase verification, entitlements, idempotency, restore, and refund handling.

Backend must not duplicate generic item, recipe, pet, event, or progression rules without an explicit server-authority requirement and shared contract.

## Work rules

- Do not implement an endpoint before its versioned contract and acceptance tests are defined.
- Validate all client input and authorize access to every player-owned resource.
- Keep secrets in environment-managed configuration; commit examples only without real values.
- Make durable grants, purchases, retries, webhooks, and multiplayer commands idempotent.
- Use migrations for persistent storage changes.
- Use bounded payloads, timeouts, rate limits, and useful error categories.
- Do not log tokens, payment details, unrestricted player text, private photos, or full LLM prompts.
- Preserve offline behavior when Backend is unavailable.
- Do not modify `Frontend/`.

## Validation

Every Backend task states unit/integration/contract tests, failure and retry cases, migration impact, security/privacy impact, and the Godot fallback behavior.
