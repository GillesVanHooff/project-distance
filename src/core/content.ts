import { D, Decimal } from './decimal';
import { metersToPlanck } from './constants';

/**
 * Shop content: generators, upgrades, and the distance gates that unlock them.
 *
 * The exact numbers below (costs, production, growth rates) are tuning
 * targets — change them via the simulator in sim/run.ts and re-check the
 * printed time-to-c, don't hand-guess. What actually carries design intent
 * is the RATIOS between tiers and the UNLOCK gates, which are real physical
 * distances (e.g. generator 2 unlocks at "atom scale", 10⁻¹⁰ m).
 *
 * Note on scale: because unlock gates are real distances and energy is
 * earned 1:1 per Planck length traveled, a generator's cost is effectively
 * anchored to how much energy the player has actually earned by the time its
 * gate is reached. The original design doc's numbers (e.g. "generator 1
 * costs 25 energy") predate that arithmetic and were replaced with values
 * that fit the scale; the ratios it specified (~10,000× cost and ~100×
 * production between tiers) are what's preserved.
 */

export interface GeneratorDef {
  id: string;
  name: string;
  /** distanceThisRun gate, in ℓₚ, at which this generator appears in the shop. */
  unlock: Decimal;
  /** Energy cost of the 1st unit. Each further unit costs costGrowth× more than the last (see generatorCost() in logic.ts). */
  baseCost: Decimal;
  /** ℓₚ/s produced per unit owned, before the global multiplier and the every-25th-unit doubling (GENERATOR_DOUBLE_EVERY). */
  baseProd: Decimal;
  /**
   * How much pricier each additional unit gets — e.g. 1.10 means the 2nd
   * unit costs 10% more than the 1st, the 3rd costs 10% more than the 2nd,
   * and so on. Falls back to GENERATOR_COST_GROWTH (constants.ts) when unset.
   * Generators 3 and 4 below set this higher on purpose, so a big fleet of
   * them gets expensive fast — that's what makes them stall out near the
   * light-speed wall instead of scaling the player straight through it.
   */
  costGrowth?: number;
}

export const GENERATORS: GeneratorDef[] = [
  {
    id: 'g1',
    name: 'Quantum Drift',
    unlock: metersToPlanck(1e-15), // proton scale — the game becomes idle here
    baseCost: D('2.5e18'),
    baseProd: D('4e11'),
  },
  {
    id: 'g2',
    name: 'Gluon Sail',
    unlock: metersToPlanck(1e-10), // atom scale — also unlocks buy-10/buy-max
    baseCost: D('2.5e23'),
    baseProd: D('5e14'),
  },
  {
    id: 'g3',
    name: 'Muon Thruster',
    unlock: metersToPlanck(8848), // Mount Everest — also unlocks Burst
    baseCost: D('2.5e37'),
    baseProd: D('5e20'),
    costGrowth: 1.45, // steeper than g1/g2 — this fleet is meant to run out of steam near the wall, not carry the player all the way to c by itself
  },
  {
    id: 'g4',
    name: 'Graviton Slingshot',
    unlock: metersToPlanck(3.844e8), // the Moon
    baseCost: D('5e42'),
    baseProd: D('1.5e22'),
    costGrowth: 1.45, // same reasoning as g3 above
  },
];

// ---------------------------------------------------------------------------
// Upgrades: leveled chains. A one-shot upgrade is a chain with maxLevel 1.
// ---------------------------------------------------------------------------

export type UpgradeCategory = 'click' | 'multiplier' | 'photon';

export interface UpgradeDef {
  id: string;
  category: UpgradeCategory;
  /** Display name; chains append a roman-ish level. */
  name: string;
  /** Shop description for the *next* level — called with the level about to be bought (1-based). */
  describe: (nextLevel: number) => string;
  /** How many times this upgrade can be bought. 1 = a one-shot upgrade, not a chain. */
  maxLevel: number;
  /** Cost in energy to buy the given level (1-based: cost(1) is the price of the first purchase). */
  cost: (level: number) => Decimal;
  /** distanceThisRun gate, in ℓₚ, before this upgrade appears in the shop. */
  unlock: Decimal;
}

/** The shop itself opens at 25 ℓₚ. */
export const SHOP_UNLOCK = D(25);

/**
 * Bootstrap click chain: carries the player from 1 ℓₚ clicks to proton scale
 * (~19 orders of magnitude) before generators exist. Each level ×5 flat click
 * value; milestones (×2 each) do the rest.
 */
export const THRUSTER_MULT = 5;

/**
 * "Momentum Capture" upgrade: each level adds +1 to N, where a click is
 * worth N seconds of the player's current passive income (see clickSeconds()
 * in logic.ts — this is CLAUDE.md's whole-game click rule). N starts at
 * MOMENTUM_BASE_SECONDS and tops out at MOMENTUM_BASE_SECONDS +
 * MOMENTUM_COSTS.length once every level is bought.
 *
 * This chain is the main lever for how much faster active play is than idle
 * play: a bigger N makes every click worth more, but only helps players who
 * are actually clicking — an idle player's time-to-c doesn't change at all,
 * since they never click. So a longer chain (higher max N) widens the gap
 * between "actively playing" and "leaving it running", and a shorter chain
 * narrows it. It was cut from 7 levels (N up to 8) to 3 (N up to 4) for
 * exactly this reason — see the balance note at the top of sim/run.ts for
 * the numbers behind that call.
 */
export const MOMENTUM_BASE_SECONDS = 1;

/**
 * Energy cost of each Momentum Capture level, cheapest (level 1) first.
 * The array's length IS the upgrade's max level (used below as
 * `maxLevel: MOMENTUM_COSTS.length`), so adding or removing an entry changes
 * how many levels exist, not just their price. This is the literal knob
 * described above: shorten the list to lower the ceiling on N and slow
 * active play down (narrowing the active/idle gap); lengthen it to do the
 * opposite.
 */
const MOMENTUM_COSTS = ['5e21', '5e29', '5e37'];

/**
 * Multiplier upgrades: 11 one-time purchases, each a permanent flat ×2 or ×3
 * to all production. Cost of the Nth one (0-indexed) is
 * MULTIPLIER_BASE_COST × MULTIPLIER_COST_SPACING^N, so each is ~100× the
 * last — buying through the whole list should feel like a steady drumbeat
 * (one purchase every several minutes), not a pile bought all at once.
 *
 * Unlock gates are progressive too (not a single shared gate): the Nth
 * upgrade (0-indexed) unlocks at 10^(N-7) meters, i.e. one order of
 * magnitude further per upgrade, 100nm through 1km. That range sits inside
 * the 0:18–0:45 mechanical-unlock window (CLAUDE.md), so the whole chain
 * reveals itself gradually rather than dumping all 11 "locked" teasers on
 * the player at once with the same distance.
 */
export const MULTIPLIER_COUNT = 11;
export const MULTIPLIER_BASE_COST = D('1e25');
export const MULTIPLIER_COST_SPACING = 100;
/** Alternates ×2 and ×3 purely for variety — the two amounts aren't meaningfully different, just less repetitive to read in the shop list. */
export function multiplierValue(index: number): number {
  return index % 2 === 0 ? 2 : 3;
}

const MULTIPLIER_NAMES = [
  'Vacuum Polish',
  'Zero-Point Tap',
  'Casimir Wedge',
  'Entropy Brake',
  'Spin Alignment',
  'Chromodynamic Gearing',
  'Vacuum Impedance Match',
  'Metric Lubricant',
  'Inertial Damper Bypass',
  'Worldline Straightener',
  'Causal Slipstream',
];

/**
 * Photon Conversion — the endgame "wall". Eight tiers, each only ×2 to all
 * production, meant to feel like physics pushing back as the player nears c.
 *
 * The design doc calls for costs ~1,000× apart per tier, but that doesn't
 * hold up here: energy is earned 1:1 with distance, and total distance only
 * grows about ×5 across this whole stretch of the run (it ends around 2 AU).
 * At 1,000× spacing, at most one tier would ever be affordable — everything
 * past it would be permanently out of reach. 8× spacing keeps the same
 * feeling (each tier costs a lot more than the speed it buys, so purchases
 * come slower and slower) while leaving tiers 2 and up reachable.
 */
export const PHOTON_TIERS = 8;
export const PHOTON_MULT = 2;
export const PHOTON_BASE_COST = D('2.5e45');
export const PHOTON_COST_SPACING = 8;

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'thruster',
    category: 'click',
    name: 'Thruster Calibration',
    describe: () => `×${THRUSTER_MULT} click strength`,
    maxLevel: 18,
    // ×10 cost per level (15, 150, 1.5K, ...) — steep enough that this alone
    // can't be farmed forever; it's meant to carry the bootstrap phase
    // (before any generator exists), not the whole game.
    cost: (level) => D(15).mul(D(10).pow(level - 1)),
    unlock: SHOP_UNLOCK,
  },
  {
    id: 'momentum',
    category: 'click',
    name: 'Momentum Capture',
    describe: (next) =>
      `Clicks are worth ${MOMENTUM_BASE_SECONDS + next}s of passive income`,
    maxLevel: MOMENTUM_COSTS.length,
    cost: (level) => D(MOMENTUM_COSTS[level - 1]!), // level is 1-based, so level 1 reads MOMENTUM_COSTS[0]
    unlock: metersToPlanck(1e-15),
  },
  ...MULTIPLIER_NAMES.map(
    (name, i): UpgradeDef => ({
      id: `mult${i}`,
      category: 'multiplier',
      name,
      describe: () => `×${multiplierValue(i)} all production`,
      maxLevel: 1,
      cost: () => MULTIPLIER_BASE_COST.mul(D(MULTIPLIER_COST_SPACING).pow(i)),
      unlock: metersToPlanck(10 ** (i - 7)),
    }),
  ),
  {
    id: 'photon',
    category: 'photon',
    name: 'Photon Conversion',
    describe: () => `×${PHOTON_MULT} all production`,
    maxLevel: PHOTON_TIERS,
    cost: (level) => PHOTON_BASE_COST.mul(D(PHOTON_COST_SPACING).pow(level - 1)),
    // The design doc says this should unlock at 30 AU, but that's physically
    // unreachable before c in a ~3h run — light itself needs ~4h to cover
    // 30 AU. Anchored to the Sun's diameter instead, which lands the wall
    // right after generator 4 (the Moon) comes online.
    unlock: metersToPlanck(1.39e9),
  },
];

export const UPGRADES_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(
  UPGRADES.map((u) => [u.id, u]),
);

/** Distance gate for buy-10 / buy-max controls. */
export const BULK_BUY_UNLOCK = metersToPlanck(1e-10);

/** Distance gate for the Burst active ability. */
export const BURST_UNLOCK = metersToPlanck(8848);
