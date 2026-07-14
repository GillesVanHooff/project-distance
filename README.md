# Project Distance

An idle/incremental browser game where the resource is **distance**. You are a particle. You start by moving one Planck length at a time, and your journey ends — eventually — at the edge of the observable universe, 46.5 billion light years away. That's 61 orders of magnitude of progress, all of it grounded in real physical scale.

## Core loop

- **Click** to push the particle forward. Clicks are always worth a few seconds of your passive income, so active play stays rewarding forever.
- **Travel** to earn energy (1 energy per Planck length traveled).
- **Spend** energy on generators and upgrades that increase your speed.
- **Hit the wall**: nothing travels faster than light. As you approach c, progress grinds down.
- **Prestige** at light speed to earn Time Crystals, reset the run, and rebuild faster — each prestige compresses how much real time a light year costs you.
- **Reach the edge** of the observable universe for the true endgame (skill-tree prestige layer, planned for much later).

## Currencies

| Currency | Role | Resets on prestige? |
|---|---|---|
| Distance (this run) | Progress metric — drives unlocks and crystal gain. Never spent, never decreases within a run. | Yes |
| Distance (lifetime) | Permanent progress metric — stats, permanent milestones. | No |
| Energy | Spendable — earned per Planck length traveled, spent in the shop. | Yes |
| Time Crystals | Prestige currency — hybrid model: passive bonus keyed to lifetime-earned, plus a prestige shop for time machine upgrades. | No |

A fourth in-run currency is planned for the galactic-scale midgame (not designed yet — code currencies as a list, not hardcoded variables).

## Status

Early development. Design is documented in `CLAUDE.md`, which is the source of truth for game design decisions.

## Tech notes

- Browser game, plain TypeScript/JS (no engine needed — the game loop is a tick function).
- **break_infinity.js** for big numbers from day one (light speed alone is ~1.8×10⁴³ ℓₚ/s; JS native numbers die at ~9×10¹⁵).
- Save: auto-save to localStorage + manual export/import.
- Offline progress: expected by the genre — decision pending on full vs. partial credit.
- Balance is tuned with a headless simulator script (greedy auto-buyer, prints time-to-c), not by hand-playing.

## License

TBD