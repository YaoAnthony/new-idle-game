# Reward Chests

`RewardChestSystem` owns reward chest runtime lifecycle: safe placement, live
views, world/object/entity registration, lights, removal, and save export.

`Chest` remains the single world-object view. React should talk to
`scene.chestSystem` or emit chest events; `GameSceneRuntime` should not keep a
separate chest map or chest-specific forwarding methods.
