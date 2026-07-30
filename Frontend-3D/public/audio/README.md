# Audio Assets

Files in this folder are served by Vite/Nginx from `/audio/...`.

The runtime does not scan this folder directly. Register every sound in:

`frontend/src/Pages/Dashboard/component/SystemIdleGame/audio/AudioRegistry.ts`

The current files under `system/` are generated placeholder sounds. Replace
them with real assets later and update the registry if paths change.

Avoid hotlinking preview CDN URLs for gameplay audio. Mixkit preview URLs, for
example, return HTTP 403 when loaded directly by the deployed game. Prefer
checked-in `relative` assets for anything that should always work in game.
