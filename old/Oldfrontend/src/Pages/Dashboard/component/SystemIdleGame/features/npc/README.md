# NPC Feature

Place NPC catalog adapters, blackboard state, day planning, autonomous utility
planning, capability-skill runtime, and dialogue integration here. NPC world
mutations should submit `WorldAction` commands.

`NPCSystem` is the scene-facing boundary for NPC runtime state. Game scene code
should ask it for roster lookup, mind-state updates, autonomy toggles, and
temporary pauses instead of storing `npc`, `extraNpcs`, memory systems, or
director systems on the Phaser scene.

The active runtime is `NPCSystem -> blackboard/NpcBlackboardSystem`.
Do not reintroduce the deleted linear `Agency/Needs/Think/Director` stack.
