# Accepted Decisions

This is a lightweight decision log. Add a new entry when a decision changes architecture, data ownership, persistence, external contracts, or long-term task guidance.

## D-001: Godot is the primary game client

Status: Accepted.

The playable game is implemented in `godot/`. `Backend/` provides online and authoritative external services. `Frontend/` is protected and is not a second implementation of gameplay.

## D-002: Initial presentation is top-down 2D

Status: Accepted.

The initial world uses 2D movement, collision, navigation, depth ordering, camera, and room interactions. Art style, tile size, camera zoom, and placement grid remain undecided and must not be embedded as architectural assumptions.

## D-003: Organize the Godot client by feature

Status: Accepted.

Gameplay scenes, scripts, and feature-specific assets live together under `features/`. Shared definitions use `data/`; serializable state uses `state/`; external adapters use `infrastructure/`; cross-feature UI uses `ui/`.

## D-004: Gameplay content is data-driven

Status: Accepted.

Items, recipes, furniture capabilities, actions, rewards, pets, events, weather, regions, dialogue references, and audio conditions are definitions loaded by reusable implementations. Display strings, balance values, input keys, and content-specific branching do not belong in generic gameplay scripts.

## D-005: Local single-player precedes account and cloud features

Status: Accepted.

New game, continue, the core loop, and local save must work without login. Authentication is introduced when cloud save, friends, multiplayer, cross-device access, or purchases require identity.

## D-006: Player Profile, World, and Session are separate state domains

Status: Accepted.

Profile preferences, durable world progression, and temporary session/network state have different ownership and persistence. They must not be stored in one undifferentiated global object.

## D-007: Saves are versioned snapshots behind a repository seam

Status: Accepted.

Gameplay code requests save/load operations through a persistence interface. Local and future cloud adapters implement that interface. Saves use stable IDs, atomic writes, backup/recovery, and migrations; live Nodes and display names are not persistence identities.

## D-008: Time and randomness are replaceable dependencies

Status: Accepted.

Game time, real time, action timers, weather, loot, region/house selection, and dispatch randomness must be deterministic under tests through controllable clock and random interfaces.

## D-009: Multiplayer uses host-owned worlds and explicit authority

Status: Provisional until multiplayer design task.

The host selects a World save for a session. Story progression is disabled by default. Durable mutations require explicit validation and conflict rules. Network state synchronizes stable IDs and domain commands/events, not raw scene trees.

## D-010: Backend owns secrets and authoritative external operations

Status: Accepted.

LLM provider calls, prompt templates, moderation, payment verification, account credentials, and authoritative online grants stay in Backend. Godot receives bounded results through contracts and must degrade safely when services are unavailable.

## D-011: The first implementation is a vertical slice

Status: Accepted.

The first playable path is: enter one test house, move and interact, place a workbench, craft and place one furniture item, unlock and complete one action, receive and use one reward, then save and reload. Breadth comes after this path is reliable.

## D-012: User-facing content is localization-ready

Status: Accepted.

UI labels, item names, dialogue, errors, tutorials, and generated-content fallbacks use localization keys or localized content data. Internal IDs remain language-neutral and stable.

## D-013: Numeric performance and balance budgets require explicit decisions

Status: Accepted.

The Harness defines where configuration belongs but does not invent target FPS, save-slot count, tile size, action duration limits, hunger rates, or platform budgets. These values must be set through focused decisions/tasks and stored in data/configuration.
