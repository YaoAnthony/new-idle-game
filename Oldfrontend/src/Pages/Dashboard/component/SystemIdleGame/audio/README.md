# Audio Feature

`GameAudioSystem` is the Phaser scene boundary for audio. `GameSceneRuntime`
only exposes the system reference; React and gameplay code should call the
system for music direction, ambience refreshes, event-mapped sounds, visibility
pause handling, volume settings, and tagged sound cleanup.

`AudioSystem`, `MusicDirector`, `EnvironmentalAudioDirector`, and
`AudioEventMapper` stay internal building blocks behind that boundary.

`EnvironmentalAudioDirector` owns layered world ambience. It reads player
position, active world, weather, time of day, and Tiled terrain cells, then mixes
tagged ambience loops such as rain and shoreline waves.

World ambience is profile-driven. `world:main` uses the outdoor profile,
`world:green-house` uses a softened greenhouse profile, and `world:house:*`
uses the house profile with outdoor ambience reduced or disabled. Indoor rain is
kept as a profile `audioKey` so it can switch to a dedicated registered loop
when that asset exists.
