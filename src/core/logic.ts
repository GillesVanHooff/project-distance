import { D, Decimal, ONE, ZERO } from './decimal';
import {
  BASELINE_FIRST_RUN_DISTANCE,
  BURST_COOLDOWN_SEC,
  BURST_DURATION_SEC,
  BURST_MULTIPLIER,
  CLICK_BASE_FLAT,
  CLICK_OVERFLOW_FACTOR,
  CLICK_RATE_CAP,
  CLICK_RATE_DECAY,
  CLICK_RATE_IMPULSE,
  C_PLANCK_PER_SEC,
  CRYSTAL_SPEED_BONUS,
  GENERATOR_COST_GROWTH,
  GENERATOR_DOUBLE_EVERY,
  GOLDEN_BOOST_DURATION_SEC,
  GOLDEN_BOOST_MULTIPLIER,
  GOLDEN_SPEED_BOOST_PCT,
  TIME_MACHINE_BASE_COST,
  TIME_MACHINE_COMPRESSION,
  TIME_MACHINE_COST_GROWTH,
} from './constants';
import {
  BURST_UNLOCK,
  GENERATORS,
  MOMENTUM_BASE_SECONDS,
  PHOTON_MULT,
  THRUSTER_MULT,
  UPGRADES_BY_ID,
  multiplierValue,
  MULTIPLIER_COUNT,
} from './content';
import { milestonesReached } from './milestones';
import { upgradeLevel, type GameState, type GoldenEffectId } from './state';

/** Golden-catch effect pool (see activateRandomGoldenEffect) — extend this
 * list to add new golden effects. */
export const GOLDEN_EFFECT_IDS: GoldenEffectId[] = ['click', 'speed'];

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/** Passive speed multiplier from lifetime-earned Time Crystals (CRYSTAL_SPEED_BONUS per crystal,
 * never reduced by spending — see CLAUDE.md's hybrid crystal model). Exposed on its own so the
 * progress panel can show "the prestige multiplier" without re-deriving it from globalMultiplier. */
export function crystalSpeedMultiplier(state: GameState): Decimal {
  return ONE.add(state.crystalsLifetime.mul(CRYSTAL_SPEED_BONUS));
}

/** Global multiplier applied to all production: milestones, one-time upgrades, photon, crystals. */
export function globalMultiplier(state: GameState): Decimal {
  let mult = D(2).pow(milestonesReached(state.currencies.distanceRun));
  for (let i = 0; i < MULTIPLIER_COUNT; i++) {
    if (upgradeLevel(state, `mult${i}`) > 0) mult = mult.mul(multiplierValue(i));
  }
  const photon = upgradeLevel(state, 'photon');
  if (photon > 0) mult = mult.mul(D(PHOTON_MULT).pow(photon));
  mult = mult.mul(crystalSpeedMultiplier(state));
  return mult;
}

/** Multiplier from an active golden speed-boost effect (see GOLDEN_EFFECT_IDS)
 * — folded straight into rawSpeed() so it flows through the same c cap
 * (generatorSpeed()/speed()) as every other speed source, never past it. */
export function goldenSpeedMultiplier(state: GameState): Decimal {
  const eff = state.goldenEffects.speed;
  if (eff.secRemaining <= 0) return ONE;
  return ONE.add(D(GOLDEN_SPEED_BOOST_PCT * eff.stacks));
}

/** Raw generator production in ℓₚ/s, before the c cap. */
export function rawSpeed(state: GameState): Decimal {
  let prod = ZERO;
  for (let i = 0; i < GENERATORS.length; i++) {
    const count = state.generators[i] ?? 0;
    if (count === 0) continue;
    const doublings = Math.floor(count / GENERATOR_DOUBLE_EVERY);
    prod = prod.add(
      GENERATORS[i]!.baseProd.mul(count).mul(D(2).pow(doublings)),
    );
  }
  return prod.mul(globalMultiplier(state)).mul(goldenSpeedMultiplier(state));
}

/** Generator-only speed, capped at c — the basis for the prestige gate,
 * clickValue()'s "N seconds of income" rule, and the scene ruler's tick-step
 * scaling (see ui/stage.ts): kept free of the click combo so combo can't
 * compound through the click-value formula, and so every click's transient
 * speed spike doesn't make the ruler's scale bar reflow. */
export function generatorSpeed(state: GameState): Decimal {
  return Decimal.min(rawSpeed(state), C_PLANCK_PER_SEC);
}

/** Extra speed from the click combo (see CLICK_RATE_* in constants.ts): scales
 * continuously with the player's live measured clicks/sec, up to CLICK_RATE_CAP,
 * then softens past it via CLICK_OVERFLOW_FACTOR — same shape as click value's
 * own diminishing returns, so 2 cps and 5 cps produce visibly different combo
 * speed instead of both maxing out. Scales with flatClickValue so it stays in
 * step with click upgrades and is 0 the instant clicking stops long enough to decay. */
export function comboSpeed(state: GameState): Decimal {
  if (state.clickRate <= 0) return ZERO;
  const withinCap = Math.min(state.clickRate, CLICK_RATE_CAP);
  const overflow = Math.max(0, state.clickRate - CLICK_RATE_CAP);
  return flatClickValue(state).mul(withinCap + overflow * CLICK_OVERFLOW_FACTOR);
}

/** Actual speed: generator speed plus click combo, capped at c. This is what
 * the speed stat/bar and the passive tick rate use — clicking continuously
 * visibly raises it, even before any generator exists. */
export function speed(state: GameState): Decimal {
  return Decimal.min(rawSpeed(state).add(comboSpeed(state)), C_PLANCK_PER_SEC);
}

/** Time compression from time machines — multiplies distance per real second, post-cap. */
export function timeCompression(state: GameState): Decimal {
  return D(TIME_MACHINE_COMPRESSION).pow(state.timeMachineLevel);
}

/** Distance gained per real second (speed capped at c, then compressed). */
export function distanceRate(state: GameState): Decimal {
  return speed(state).mul(timeCompression(state));
}

// ---------------------------------------------------------------------------
// Clicking
// ---------------------------------------------------------------------------

/** Flat bootstrap click value (before generators exist). */
export function flatClickValue(state: GameState): Decimal {
  return D(CLICK_BASE_FLAT)
    .mul(D(THRUSTER_MULT).pow(upgradeLevel(state, 'thruster')))
    .mul(globalMultiplier(state));
}

/** Seconds of passive income one click is worth (the whole-game rule). */
export function clickSeconds(state: GameState): number {
  return MOMENTUM_BASE_SECONDS + upgradeLevel(state, 'momentum');
}

/**
 * Full click value at bucket factor 1 (no burst): flat bootstrap value plus
 * N seconds of the player's *current* passive income (clickSeconds() — the
 * "clicks are worth N seconds of income" rule). Because it reads
 * generator speed live, a click is worth more the faster the player is
 * already going — this is what makes clicking compound with generator
 * growth. Deliberately reads generator speed rather than the combo-inclusive
 * distanceRate(), so the click combo (below) can't compound through this
 * formula too — it only ever adds visible speed, never inflates click value.
 */
export function clickValue(state: GameState): Decimal {
  const generatorPassiveRate = generatorSpeed(state).mul(timeCompression(state));
  return flatClickValue(state).add(generatorPassiveRate.mul(clickSeconds(state)));
}

export function burstUnlocked(state: GameState): boolean {
  return state.currencies.distanceRun.gte(BURST_UNLOCK) || state.prestigeCount > 0;
}

export function burstReady(state: GameState): boolean {
  return burstUnlocked(state) && state.burstCooldownSec <= 0 && state.burstActiveSec <= 0;
}

export function activateBurst(state: GameState): boolean {
  if (!burstReady(state)) return false;
  state.burstActiveSec = BURST_DURATION_SEC;
  state.burstCooldownSec = BURST_COOLDOWN_SEC;
  return true;
}

/** Golden particle catch payoff (see render/scene.ts's consumeGoldenCatch) —
 * picks a random effect from GOLDEN_EFFECT_IDS. Catching the same effect
 * again while it's active adds a stack and refreshes its timer to the full
 * duration; catching a different effect starts its own independent timer
 * rather than interrupting the first. */
export function activateRandomGoldenEffect(state: GameState): GoldenEffectId {
  const id = GOLDEN_EFFECT_IDS[Math.floor(Math.random() * GOLDEN_EFFECT_IDS.length)]!;
  const eff = state.goldenEffects[id];
  eff.stacks = eff.secRemaining > 0 ? eff.stacks + 1 : 1;
  eff.secRemaining = GOLDEN_BOOST_DURATION_SEC;
  return id;
}

/**
 * Perform one click. Returns the distance gained (for floating text).
 * Diminishing returns past ~CLICK_RATE_CAP clicks/sec via a token bucket,
 * so autoclickers gain little beyond human rates.
 */
export function click(state: GameState): Decimal {
  let factor = CLICK_OVERFLOW_FACTOR;
  if (state.clickBucket >= 1) {
    state.clickBucket -= 1;
    factor = 1;
  }
  let value = clickValue(state).mul(factor);
  if (state.burstActiveSec > 0) value = value.mul(BURST_MULTIPLIER);
  const clickBoost = state.goldenEffects.click;
  if (clickBoost.secRemaining > 0) value = value.mul(GOLDEN_BOOST_MULTIPLIER * clickBoost.stacks);
  gainDistance(state, value);
  state.totalClicks += 1;
  state.clickRate += CLICK_RATE_IMPULSE;
  return value;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/** Distance never decreases; energy is earned 1:1 per ℓₚ traveled. */
export function gainDistance(state: GameState, delta: Decimal): void {
  state.currencies.distanceRun = state.currencies.distanceRun.add(delta);
  state.currencies.distanceLifetime = state.currencies.distanceLifetime.add(delta);
  state.currencies.energy = state.currencies.energy.add(delta);
}

/** Advance the simulation by dt seconds. Pure logic — no DOM, shared with sim/. */
export function tick(state: GameState, dt: number): void {
  gainDistance(state, distanceRate(state).mul(dt));
  state.runTimeSec += dt;
  if (state.burstActiveSec > 0) state.burstActiveSec = Math.max(0, state.burstActiveSec - dt);
  else if (state.burstCooldownSec > 0) {
    state.burstCooldownSec = Math.max(0, state.burstCooldownSec - dt);
  }
  for (const id of GOLDEN_EFFECT_IDS) {
    const eff = state.goldenEffects[id];
    if (eff.secRemaining > 0) {
      eff.secRemaining = Math.max(0, eff.secRemaining - dt);
      if (eff.secRemaining === 0) eff.stacks = 0;
    }
  }
  state.clickBucket = Math.min(CLICK_RATE_CAP, state.clickBucket + CLICK_RATE_CAP * dt);
  state.clickRate *= Math.exp(-CLICK_RATE_DECAY * dt);
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

export function generatorUnlocked(state: GameState, index: number): boolean {
  return state.currencies.distanceRun.gte(GENERATORS[index]!.unlock);
}

function generatorCostGrowth(index: number): number {
  return GENERATORS[index]!.costGrowth ?? GENERATOR_COST_GROWTH;
}

/** Cost of the next single unit of a generator. */
export function generatorCost(state: GameState, index: number): Decimal {
  const owned = state.generators[index] ?? 0;
  return GENERATORS[index]!.baseCost.mul(D(generatorCostGrowth(index)).pow(owned));
}

/**
 * Total cost of the next `count` units. Each unit costs `r` (costGrowth)
 * times the previous one, so this is the closed-form sum of a geometric
 * series (next + next·r + next·r² + ... for `count` terms) rather than a
 * loop — matters because `count` can be in the hundreds when the player
 * hits "buy max".
 */
export function generatorBulkCost(state: GameState, index: number, count: number): Decimal {
  const next = generatorCost(state, index);
  const r = generatorCostGrowth(index);
  return next.mul(D(r).pow(count).sub(1)).div(r - 1);
}

/**
 * How many units of a generator the player can afford right now — the
 * "buy max" button's count. Same geometric series as generatorBulkCost(),
 * solved backwards: instead of "cost of N units", we want the largest N
 * whose cost fits in the player's current energy, so the series sum is
 * inverted with a log instead of walked one purchase at a time (which would
 * be far too slow when N is in the hundreds).
 */
export function generatorMaxAffordable(state: GameState, index: number): number {
  const next = generatorCost(state, index);
  const energy = state.currencies.energy;
  if (energy.lt(next)) return 0;
  const r = generatorCostGrowth(index);
  const n = energy.mul(r - 1).div(next).add(1).log10() / Math.log10(r);
  return Math.max(0, Math.floor(n));
}

export interface GeneratorPurchaseResult {
  bought: number;
  /** Set to the generator's new total doubling count (e.g. 2 means output is
   * now ×4, see GENERATOR_DOUBLE_EVERY/rawSpeed) if this purchase crossed one
   * or more doubling thresholds — undefined otherwise. A bulk buy can cross
   * several at once (e.g. buy-max jumping from 20 owned to 80 owned crosses
   * both the 25 and 50 and 75 thresholds); callers only need to know the
   * final multiplier reached, so this is the after-count's doublings, not a
   * list of every one crossed. */
  newDoublingCount?: number;
}

export function buyGenerator(state: GameState, index: number, count: number): GeneratorPurchaseResult {
  if (!generatorUnlocked(state, index) || count <= 0) return { bought: 0 };
  const affordable = Math.min(count, generatorMaxAffordable(state, index));
  if (affordable <= 0) return { bought: 0 };
  const total = generatorBulkCost(state, index, affordable);
  const before = state.generators[index] ?? 0;
  const after = before + affordable;
  state.currencies.energy = state.currencies.energy.sub(total).max(ZERO);
  state.generators[index] = after;
  const beforeDoublings = Math.floor(before / GENERATOR_DOUBLE_EVERY);
  const afterDoublings = Math.floor(after / GENERATOR_DOUBLE_EVERY);
  return {
    bought: affordable,
    newDoublingCount: afterDoublings > beforeDoublings ? afterDoublings : undefined,
  };
}

export function upgradeUnlocked(state: GameState, id: string): boolean {
  const def = UPGRADES_BY_ID.get(id);
  return def !== undefined && state.currencies.distanceRun.gte(def.unlock);
}

/** Cost of the next level of an upgrade chain, or undefined if maxed. */
export function upgradeNextCost(state: GameState, id: string): Decimal | undefined {
  const def = UPGRADES_BY_ID.get(id);
  if (!def) return undefined;
  const level = upgradeLevel(state, id);
  if (level >= def.maxLevel) return undefined;
  return def.cost(level + 1);
}

export function buyUpgrade(state: GameState, id: string): boolean {
  if (!upgradeUnlocked(state, id)) return false;
  const cost = upgradeNextCost(state, id);
  if (cost === undefined || state.currencies.energy.lt(cost)) return false;
  state.currencies.energy = state.currencies.energy.sub(cost);
  state.upgrades[id] = upgradeLevel(state, id) + 1;
  return true;
}

// ---------------------------------------------------------------------------
// Prestige
// ---------------------------------------------------------------------------

/** Prestige triggers on reaching light speed — the only non-distance gate in the game. */
export function canPrestige(state: GameState): boolean {
  return rawSpeed(state).gte(C_PLANCK_PER_SEC);
}

/**
 * crystals = sqrt(distanceThisRun / baseline). A square root (rather than a
 * flat ratio) means going 10× deeper into a run only earns ~3× the crystals
 * — deliberately diminishing, so "reset now" and "push further first" stay
 * both viable instead of one strictly dominating. BASELINE_FIRST_RUN_DISTANCE
 * is tuned so prestiging right when c is first reached on run 1 yields ~1
 * crystal; every extra minute cruising at c after that earns more (see the
 * --cruise flag in sim/run.ts).
 */
export function crystalsOnPrestige(state: GameState): Decimal {
  if (!canPrestige(state)) return ZERO;
  return Decimal.max(
    ONE,
    state.currencies.distanceRun.div(BASELINE_FIRST_RUN_DISTANCE).sqrt().floor(),
  );
}

export function prestige(state: GameState): Decimal {
  const gain = crystalsOnPrestige(state);
  if (gain.lte(0)) return ZERO;
  state.currencies.crystals = state.currencies.crystals.add(gain);
  state.crystalsLifetime = state.crystalsLifetime.add(gain);
  state.currencies.distanceRun = ZERO;
  state.currencies.energy = ZERO;
  state.generators = GENERATORS.map(() => 0);
  state.upgrades = {};
  state.prestigeCount += 1;
  state.runTimeSec = 0;
  state.burstActiveSec = 0;
  state.burstCooldownSec = 0;
  for (const id of GOLDEN_EFFECT_IDS) state.goldenEffects[id] = { stacks: 0, secRemaining: 0 };
  return gain;
}

// ---------------------------------------------------------------------------
// Prestige shop: time machines
// ---------------------------------------------------------------------------

export function timeMachineCost(state: GameState): Decimal {
  return D(TIME_MACHINE_BASE_COST).mul(
    D(TIME_MACHINE_COST_GROWTH).pow(state.timeMachineLevel),
  );
}

export function buyTimeMachine(state: GameState): boolean {
  const cost = timeMachineCost(state);
  if (state.currencies.crystals.lt(cost)) return false;
  state.currencies.crystals = state.currencies.crystals.sub(cost);
  state.timeMachineLevel += 1;
  return true;
}
