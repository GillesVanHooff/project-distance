import { PERCENT_C_UNLOCK } from '../core/content';
import { distanceRate, speed } from '../core/logic';
import { lastMilestone } from '../core/milestones';
import type { GameState } from '../core/state';
import { formatDistance, formatNumber, formatPercentOfC, formatSpeed } from '../core/units';
import type { UiRefs } from './dom';

/** Log-mapped 0..1 visual intensity for the canvas scene — not literal % of c, so
 * ambient motion stays readable across all 43 orders of magnitude the real speed spans. */
export function visualSpeedFraction(rawSpeedPlanckPerSec: number): number {
  if (rawSpeedPlanckPerSec <= 0) return 0;
  const norm = Math.max(0, Math.min(1, Math.log10(rawSpeedPlanckPerSec) / 43));
  return 0.08 + norm * 0.92;
}

export function updateStage(state: GameState, refs: UiRefs): number {
  const { value, symbol } = formatDistance(state.currencies.distanceRun);
  refs.distanceValue.textContent = value;
  refs.distanceUnit.textContent = symbol;

  const last = lastMilestone(state.currencies.distanceRun);
  refs.distanceComparison.textContent = last ? `farther than ${last.name}` : '';

  refs.energyValue.textContent = formatNumber(state.currencies.energy);
  refs.energyIncome.textContent = `+${formatNumber(distanceRate(state))}/s`;

  const spd = speed(state);
  refs.speedValue.textContent = formatSpeed(spd);

  const percentUnlocked = state.currencies.distanceRun.gte(PERCENT_C_UNLOCK);
  refs.percentCWrap.classList.toggle('is-hidden', !percentUnlocked);
  if (percentUnlocked) {
    refs.percentCValue.textContent = formatPercentOfC(spd);
  }

  const rawSpeedNum = spd.toNumber();
  const fraction = visualSpeedFraction(rawSpeedNum);
  refs.speedBarFill.style.width = `${Math.round(fraction * 100)}%`;

  return fraction;
}

export function hideClickHint(refs: UiRefs): void {
  refs.clickHint.classList.add('is-hidden');
}
