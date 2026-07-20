# Shared Contracts

This directory is the source location for versioned contracts shared by the Godot client and Backend.

- `save_schema.json`: save envelope/schema when persistence implementation begins.
- `api_schema.yaml`: HTTP API contract when online endpoints begin.
- `multiplayer_protocol.md`: multiplayer commands, events, authority, revisions, and reconciliation.

The current contract files are intentionally empty placeholders. Do not invent a complete schema before the relevant task resolves ownership, compatibility, and acceptance criteria.

Contract changes require validation on both producer and consumer sides, compatibility notes, versioning, and fixture updates. Secrets and provider-specific credentials never belong in a contract.
