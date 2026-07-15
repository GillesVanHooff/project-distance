import { D, Decimal } from './decimal';
import { GENERATORS } from './content';
import { nextMilestone } from './milestones';
import { canPrestige, gainDistance, prestige } from './logic';
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
 * Roughly double the last generator's owned count (minimum +10), for testing
 * the speed bar / %-of-c display without grinding. Repeatable: each press
 * ramps speed up further, converging on c over a handful of clicks rather
 * than jumping straight there (that's what Force Prestige is for).
 */
export function debugAddSpeed(state: GameState): void {
  const lastIndex = GENERATORS.length - 1;
  const current = state.generators[lastIndex] ?? 0;
  state.generators[lastIndex] = current + Math.max(10, current);
}
