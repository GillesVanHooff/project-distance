import { D, Decimal, ZERO } from './decimal';
import { GENERATORS } from './content';
import { nextMilestone } from './milestones';
import { canPrestige, gainDistance, generatorSpeed, globalMultiplier, prestige } from './logic';
import { C_PLANCK_PER_SEC, GENERATOR_DOUBLE_EVERY } from './constants';
import type { GameState } from './state';

/**
 * Dev-only admin actions for live-testing (main.ts only wires these up when
 * import.meta.env.DEV is true, so none of this ships in the production build).
 */

/** Jump distanceThisRun straight to the next flavor milestone, or +1 order of magnitude past the last one. */
export function debugSkipToNextMilestone(state: GameState): void {
  const current = state.currencies.distanceRun;
  const next = nextMilestone(current);
  const target = next ? next.planck.mul(1.001) : current.mul(10).add(1);
  const delta = target.sub(current);
  if (delta.gt(0)) gainDistance(state, delta);
}

/** Add a large chunk of spendable energy, for testing shop purchases without grinding. */
export function debugAddEnergy(state: GameState, amount: Decimal = D('1e12')): void {
  state.currencies.energy = state.currencies.energy.add(amount);
}

/**
 * Force a prestige even if the player hasn't reached c yet. Temporarily
 * inflates the last generator's count enough to clear the speed gate — real
 * prestige() then computes crystals off distanceRun as usual and resets
 * generators back to 0, so no invariants are bypassed, just fast-forwarded.
 */
export function debugForcePrestige(state: GameState): Decimal {
  if (!canPrestige(state)) {
    const lastIndex = GENERATORS.length - 1;
    state.generators[lastIndex] = (state.generators[lastIndex] ?? 0) + 1_000_000;
  }
  return prestige(state);
}

/** Grant lifetime crystals directly, for testing the passive speed bonus / time machine shop. */
export function debugAddCrystals(state: GameState, amount: Decimal = D(5)): void {
  state.currencies.crystals = state.currencies.crystals.add(amount);
  state.crystalsLifetime = state.crystalsLifetime.add(amount);
}

/**
 * Fixed ladder of target speeds, in raw ℓₚ/s, the debug button steps through
 * one rung per press: every order of magnitude from 10² up to c (~1.86e43,
 * i.e. 10^43.27) — about 42 rungs. Static rather than computed off the current
 * speed (e.g. "double it") so the ramp is identical every game regardless of
 * what's already owned, and can't compound into a runaway jump.
 *
 * Deliberately spaced evenly in raw ℓₚ/s log-space rather than in real-world
 * units (m/s, km/s, ...): the speed bar (visualSpeedFraction in ui/stage.ts)
 * is itself log-mapped (then power-curved) across the full 1 ℓₚ/s-to-c range,
 * so a ladder built from real-world speeds would bunch nearly every rung into
 * the bar's first ~50% (all of mm/s through km/s) and leave only the last few
 * rungs to cover the actual approach to c — the opposite of what this ladder
 * is for, which is testing that final stretch one rung at a time.
 *
 * One rung per OoM (not two) so more presses land inside the last 10% of the
 * bar: ParticleScene's HYPERSPACE_START (render/scene.ts) eases in the
 * light-speed streak effect once the bar crosses 90%, so a coarser ladder
 * blew through that whole payoff stretch in a rung or two — visually reading
 * as "instantly at lightspeed" well before the bar (or canPrestige) actually
 * hit 100%.
 */
const DEBUG_SPEED_STEPS: readonly Decimal[] = Array.from({ length: 42 }, (_, i) =>
  D(10).pow(2 + i),
);

/**
 * Advance to the next rung of DEBUG_SPEED_STEPS, for testing the speed bar /
 * %-of-c display without grinding.
 *
 * Works by solving for the last generator's owned count that hits the target
 * speed, rather than just scaling its owned count directly: that generator's
 * production doubles every GENERATOR_DOUBLE_EVERY owned (logic.ts), which is
 * exponential in count, so naively doubling count made the doublings stack up
 * and the very next press blow straight through to c instead of landing
 * partway there.
 */
export function debugAddSpeed(state: GameState): void {
  const cap = C_PLANCK_PER_SEC;
  const current = generatorSpeed(state);
  if (current.gte(cap)) return;

  const next = DEBUG_SPEED_STEPS.find((s) => s.gt(current)) ?? cap;
  const target = Decimal.min(next, cap.mul(1 - 1e-9));

  const lastIndex = GENERATORS.length - 1;
  const mult = globalMultiplier(state);
  let othersProd = ZERO;
  for (let i = 0; i < lastIndex; i++) {
    const count = state.generators[i] ?? 0;
    if (count === 0) continue;
    const doublings = Math.floor(count / GENERATOR_DOUBLE_EVERY);
    othersProd = othersProd.add(GENERATORS[i]!.baseProd.mul(count).mul(D(2).pow(doublings)));
  }
  const neededLastProd = target.div(mult).sub(othersProd);

  const lastGenProd = (count: number): Decimal => {
    if (count <= 0) return ZERO;
    const doublings = Math.floor(count / GENERATOR_DOUBLE_EVERY);
    return GENERATORS[lastIndex]!.baseProd.mul(count).mul(D(2).pow(doublings));
  };

  let lo = state.generators[lastIndex] ?? 0;
  let hi = Math.max(lo * 2, 10);
  while (lastGenProd(hi).lt(neededLastProd)) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (lastGenProd(mid).lt(neededLastProd)) lo = mid;
    else hi = mid;
  }
  state.generators[lastIndex] = Math.ceil(hi);
}
