# Evaluation: First playable loop

## Purpose

Prove that the smallest version of the game's core promise works end to end: a top-down player uses home capabilities to complete a real-life Action, receives a reward, spends it meaningfully, and preserves progress across reload.

## Type

Hybrid automated and manual.

## Preconditions

- Development build using the first-playable content catalog.
- One test house definition.
- Fixed clock and fixed random seed for automated setup.
- Clean local profile and World slot.
- Backend, login, multiplayer, LLM, and commerce disabled.

## Setup

Create a new local World in the test house with a data-defined starting inventory containing the minimum workbench and recipe inputs required by the milestone. Do not inject state after the World starts unless the test explicitly records it.

## Steps

1. Start a new local game and enter the top-down test house.
2. Move in every supported direction, collide with room boundaries, and approach the intended interaction area.
3. Open inventory using the mapped inventory action.
4. Enter furniture placement, preview the workbench, test one invalid placement, then confirm one valid placement.
5. Interact with the workbench using the mapped interaction action.
6. Observe one visible data-defined recipe and craft its furniture output.
7. Confirm ingredients are consumed once and output is added once.
8. Place the crafted furniture and observe one Action becoming available because of its capability.
9. Create/select the Action, start it, advance through the test clock, and complete it.
10. Receive the defined reward exactly once.
11. Use the reward through the one branch selected by the milestone task.
12. Trigger a save, exit to a stable state, close the game, restart, and continue the World.
13. Verify the workbench, crafted furniture, inventories, Action result, reward consumption, and player/World progression remain consistent.

## Assertions

- Movement, collision, camera, targeting, and UI remain coherent in top-down 2D.
- Physical default keys/buttons can be remapped without breaking the flow.
- Invalid placement changes no durable state.
- Crafting is atomic and cannot duplicate or partially consume items.
- Action availability derives from furniture capability data.
- Timer tests do not wait for a production-duration timer.
- Reward completion is idempotent.
- Save is versioned and reload restores stable IDs/state rather than scene paths.
- Missing Backend connectivity does not affect the flow.
- No user-facing string or content-specific balance value is embedded in generic scene logic.

## Failure evidence

Retain development logs, failing assertion output, the test content catalog version, random seed, save fixture, and screenshots for visual/placement failures. Do not record secrets or unrelated personal data.

## Cleanup

Use an isolated test save location or test slot. Preserve a failing fixture only when attached to a defect; otherwise remove test Worlds through the supported test cleanup path.

## Result

Not run. This evaluation becomes active when M2 implementation tasks are ready.
