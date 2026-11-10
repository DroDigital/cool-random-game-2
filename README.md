# Shardfall

A fast, zero-build 3D elemental roguelite ARPG. You wield a runic blade, swap between three elemental **Aspects**, and fight through three biomes to the guardian of each one.

Everything is procedural: geometry, textures, music and sound effects are generated at runtime. The repo is plain ES modules plus a vendored copy of [Three.js](https://threejs.org) (MIT, see `lib/LICENSE-three`).

## Run it

ES modules need to be served over HTTP (not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works. It targets modern desktop browsers with WebGL 2 (tested in headless Chromium so far).

## Controls

| Action | Input |
| --- | --- |
| Move | `W A S D` |
| Slash combo (3 hits, 3rd is a finisher) | Hold `LMB` |
| Aspect skill | `RMB` |
| Singularity (gravity well, cooldown) | `Q` |
| Cataclysm (needs full Surge) | `R` |
| Dash (2 charges, dodges, cannot be hit while dashing) | `Space` |
| Switch Aspect | `1` `2` `3`, `Tab`, or mouse wheel |
| Pause / mute | `Esc` / `M` |
| Pick a card | `1` `2` `3` or click |
| Shop | Walk to the Wanderer, press `E` |

## Design

- **Three Aspects.** Ember (Fireball, burns), Frost (Glacial Lance, chills and freezes) and Volt (Chain Lightning, arcs between foes). Every hit fills Surge.
- **Elemental reactions.** Ember + Frost = **Steam Burst**. Ember + Volt = **Overload** (blast). Frost + Volt = **Superconduct** (vulnerability). Hitting a frozen foe = **Shatter**.
- **Boons.** 30 run-defining upgrades in four rarities, including synergies such as Phoenix Step (dash leaves fire), Stormstep, Glacial Step, Event Horizon, Mirror Blades and Trinity Resonance.
- **Seven room types.** Slaughter (waves), Defend the Heart (protect a crystal), Champion Hunt (a marked elite that calls reinforcements), Tempest (survive storm strikes), Prism Trial (wards that only one Aspect can break), the Wanderer's Bazaar (shop) and guardian bosses.
- **Three biomes, three guardians.** The Cinder Reach (Magma Colossus), Frostbound Hollow (Glacial Weaver) and Voltaic Abyss (Archon of the Storm). Each has phase changes and telegraphed attacks.
- **Adaptive music.** The soundtrack thickens with the number of foes on screen.

## Layout

```
index.html        HUD, overlays, import map
js/main.js        renderer, post-processing, input, game flow, camera
js/state.js       shared state, Aspects, biomes, room types
js/combat.js      player, damage and reactions, skills, projectiles, hazards, pickups
js/enemies.js     enemy AI, elites, wards, guardian attacks
js/rooms.js       run flow, room generation, rewards, portals, shop
js/boons.js       boon definitions and weighted rolls
js/models.js      procedural low-poly models
js/world.js       arenas, biome textures, lighting, skies
js/fx.js          particles, rings, slashes, beams, lights, floating text
js/audio.js       WebAudio sound effects and adaptive music
js/ui.js          HUD, cards, shop, portal labels
lib/              vendored Three.js r170 (module build + postprocessing)
```
