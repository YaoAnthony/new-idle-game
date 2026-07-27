# Farming Feature

Place crop catalogs, farm rules, growth, watering, planting, harvesting, and
farm tile view adapters here. World-changing farm operations should enter
through `world/actions`.

`TreeSystem` owns tree entities end-to-end: initial tree spawning, `TreeView`
instances, nearest-tree queries, player/NPC chop and fruit-pick actions, save
snapshots, and multiplayer chopped-tree snapshots. `TreeStateSystem` remains
its internal state-sync helper for growth, fruit, and chopped state.
