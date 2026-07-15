import { D } from './decimal';

/** 1 Planck length in meters. All internal distances are stored in Planck lengths (ℓₚ). */
export const PLANCK_METERS = 1.616255e-35;

/** Speed of light in m/s. */
export const C_METERS_PER_SEC = 299_792_458;

/** Speed of light in ℓₚ/s — the hard speed cap and the prestige trigger. */
export const C_PLANCK_PER_SEC = D(C_METERS_PER_SEC / PLANCK_METERS); // ≈ 1.855e43

export const METERS_PER_KM = 1e3;
export const METERS_PER_AU = 1.495978707e11;
export const METERS_PER_LIGHT_DAY = C_METERS_PER_SEC * 86_400;
export const METERS_PER_LIGHT_YEAR = 9.460_730_472_580_8e15;

/** Edge of the observable universe: 46.5 billion light years, in meters. */
export const UNIVERSE_EDGE_METERS = 46.5e9 * METERS_PER_LIGHT_YEAR;

/** Convert a distance in meters to Planck lengths (as Decimal). */
export function metersToPlanck(meters: number) {
  return D(meters).div(PLANCK_METERS);
}

// ---------------------------------------------------------------------------
// Tuning constants (targets, not physics — adjust via the sim in sim/run.ts)
// ---------------------------------------------------------------------------

/**
 * Baseline distance (ℓₚ) of a first run at the moment c is reached.
 * Crystal formula: crystals = sqrt(distanceThisRun / baseline).
 * Set from simulator output so that prestiging right at c on run 1 grants ~1 crystal.
 */
export const BASELINE_FIRST_RUN_DISTANCE = D('4.8e46');

/** Passive speed bonus per lifetime-earned Time Crystal (+25% each). */
export const CRYSTAL_SPEED_BONUS = 0.25;

/** Default generator cost growth per purchase; late tiers override this upward (see content.ts) so the generator engine stalls into the wall instead of riding through it. */
export const GENERATOR_COST_GROWTH = 1.10;

/** Every Nth generator owned doubles that generator's output (Antimatter Dimensions rule). */
export const GENERATOR_DOUBLE_EVERY = 25;

/** Base flat click value (ℓₚ) before any generators exist — the bootstrap phase. */
export const CLICK_BASE_FLAT = 1;

/** Diminishing returns: clicks beyond this rate per second are worth CLICK_OVERFLOW_FACTOR. */
export const CLICK_RATE_CAP = 5;
export const CLICK_OVERFLOW_FACTOR = 0.15;

/**
 * Click combo: sustained clicking ramps a 0..1 charge (see clickCombo() in
 * logic.ts) that adds real, visible speed — this is what makes the speed
 * stat move before Generator 1 exists, per CLAUDE.md rule 3's
 * "buff-with-duration" active-play bonus. Builds fast (a few clicks fills
 * it), decays fast (~1.25s of no clicking empties it), so it reads as
 * momentum from continuous clicking rather than a permanent gain.
 */
export const CLICK_COMBO_BUILD_PER_CLICK = 0.4;
export const CLICK_COMBO_DECAY_PER_SEC = 0.8;

/** Burst active ability: clicks are boosted for a duration, then a cooldown. */
export const BURST_MULTIPLIER = 4;
export const BURST_DURATION_SEC = 10;
export const BURST_COOLDOWN_SEC = 90;

/** Time machine (prestige shop): each level doubles time compression. Cost = 3^level crystals. */
export const TIME_MACHINE_BASE_COST = 1;
export const TIME_MACHINE_COST_GROWTH = 3;
export const TIME_MACHINE_COMPRESSION = 2;

/** Logic tick rate (Hz). Rendering runs on rAF, independent of this. */
export const TICK_RATE = 20;

/** Offline progress: full credit, capped at 30 days, simulated in this many chunks. */
export const OFFLINE_CAP_SEC = 30 * 86_400;
export const OFFLINE_CHUNKS = 500;
