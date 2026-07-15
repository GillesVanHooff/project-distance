import { PERCENT_C_UNLOCK } from '../core/content';
import { distanceRate, generatorSpeed, speed } from '../core/logic';
import { lastMilestone } from '../core/milestones';
import type { GameState } from '../core/state';
import {
  formatDistance,
  formatNumber,
  formatPercentOfC,
  formatSpeed,
  toUnitScale,
  unitScaleForDistance,
} from '../core/units';
import type { UiRefs } from './dom';

/** Log-mapped 0..1 visual intensity for the canvas scene — not literal % of c, so
 * ambient motion stays readable across all 43 orders of magnitude the real speed spans.
 * Below 1 ℓₚ/s reads as stopped: the speed stat's own display floors to "0" below that
 * (formatDistance's chunky-integer rounding), so anything smaller — e.g. a click combo
 * mid-decay — would otherwise show a moving trail next to a "0" readout. */
export function visualSpeedFraction(rawSpeedPlanckPerSec: number): number {
  if (rawSpeedPlanckPerSec < 1) return 0;
  const norm = Math.max(0, Math.min(1, Math.log10(rawSpeedPlanckPerSec) / 43));
  return 0.08 + norm * 0.92;
}

/** Live numbers for the scene's scale ruler — same unit the odometer is showing,
 * so the ruler's ticks are never lying relative to the number above them. */
export interface RulerReading {
  symbol: string;
  distanceInUnit: number;
  speedInUnitPerSec: number;
}

export interface StageFrame {
  visualFraction: number;
  ruler: RulerReading;
}

export function updateStage(state: GameState, refs: UiRefs): StageFrame {
  const { value, symbol, raw } = formatDistance(state.currencies.distanceRun);
  refs.distanceValue.textContent = value;
  refs.distanceUnit.textContent = symbol === 'ℓₚ' ? 'Planck Lengths' : symbol;

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

  const scale = unitScaleForDistance(state.currencies.distanceRun);
  // Ruler tick-step scaling deliberately ignores the click combo (uses
  // generator-only speed) — otherwise every click's transient speed spike
  // reflows the scale bar's step size, reading as a continuous "zoom" jitter.
  const speedInUnitPerSec = toUnitScale(generatorSpeed(state), scale);

  return { visualFraction: fraction, ruler: { symbol, distanceInUnit: raw, speedInUnitPerSec } };
}

export function hideClickHint(refs: UiRefs): void {
  refs.clickHint.classList.add('is-hidden');
}
