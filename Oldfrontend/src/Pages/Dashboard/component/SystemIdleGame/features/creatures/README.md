# Creatures Feature

Place animal and nest lifecycle systems here. Creature state should remain in
the world model and render through Phaser view classes.

- `CreatureSystem` owns chicken/nest runtime lifecycle: Phaser groups, view
  arrays, spawning, per-frame updates, and save-state creature restore.
- `ChickenStateSystem` owns chicken behaviour state transitions.
- `NestStateSystem` owns nest occupancy, eggs, hatching, and collection.
