import {
  C_PLANCK_PER_SEC,
  CLICK_RATE_CAP,
  GOLDEN_BOOST_DURATION_SEC,
  GOLDEN_BOOST_MULTIPLIER,
  GOLDEN_SPEED_BOOST_PCT,
} from '../core/constants';
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

/** Exact OoM span from 1 ℓₚ/s to c, in raw log10(ℓₚ/s) — replaces the earlier
 * hardcoded "43" (c is actually ~43.27 OoM up) so the bar hits 100% exactly at c. */
const LOG_C_PLANCK_PER_SEC = Math.log10(C_PLANCK_PER_SEC.toNumber());

/** Exponent applied to the raw log-normalized speed before mapping to 0..1.
 * A plain linear-in-log mapping front-loads the bar: a Planck length is so tiny
 * that any humanly-noticeable speed (1 mm/s is already ~32 of the 43 orders of
 * magnitude up from 1 ℓₚ/s) reads as most of the way to lightspeed within the
 * first few minutes of play. Raising the normalized value to this power pushes
 * that early/mid stretch down (1 mm/s ≈ 23%, 1 km/s ≈ 49%) and reserves the
 * bar's last stretch for the actual approach to c, so the "wall" grind still
 * reads as a payoff climb rather than the bar already looking nearly full. */
const SPEED_CURVE_EXPONENT = 6;

/** Log-mapped 0..1 visual intensity for the canvas scene — not literal % of c, so
 * ambient motion stays readable across all 43 orders of magnitude the real speed spans.
 * Below 1 ℓₚ/s reads as stopped: the speed stat's own display floors to "0" below that
 * (formatDistance's chunky-integer rounding), so anything smaller — e.g. a click combo
 * mid-decay — would otherwise show a moving trail next to a "0" readout. */
export function visualSpeedFraction(rawSpeedPlanckPerSec: number): number {
  if (rawSpeedPlanckPerSec < 1) return 0;
  const norm = Math.max(0, Math.min(1, Math.log10(rawSpeedPlanckPerSec) / LOG_C_PLANCK_PER_SEC));
  const shaped = norm ** SPEED_CURVE_EXPONENT;
  return 0.08 + shaped * 0.92;
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
  /** Current clicks/sec relative to CLICK_RATE_CAP (>1 past the cap) — drives
   * the scene trail's click-reactive flare, separately from visualFraction's
   * heavily log-compressed overall speed level (see ParticleScene.update). */
  clickIntensity: number;
  ruler: RulerReading;
  /** 0..1, max remaining/total across all active golden effects — drives the
   * scene's gold aura/spark effect on the main particle while any golden-catch
   * effect is active (see ParticleScene.update). */
  goldenBoostFraction: number;
}

export function updateStage(state: GameState, refs: UiRefs): StageFrame {
  const { value, symbol, raw } = formatDistance(state.currencies.distanceRun, true);
  refs.distanceValue.innerHTML = value;
  refs.distanceUnit.textContent = symbol === 'ℓₚ' ? 'Planck Lengths (ℓₚ)' : symbol;

  const last = lastMilestone(state.currencies.distanceRun);
  refs.distanceComparison.textContent = last ? `farther than ${last.name}` : '';

  refs.energyValue.innerHTML = formatNumber(state.currencies.energy, true);
  refs.energyIncome.innerHTML = `+${formatNumber(distanceRate(state), true)}/s`;

  const spd = speed(state);
  refs.speedValue.innerHTML = formatSpeed(spd, true);

  const percentUnlocked = state.currencies.distanceRun.gte(PERCENT_C_UNLOCK);
  refs.percentCWrap.classList.toggle('is-hidden', !percentUnlocked);
  if (percentUnlocked) {
    refs.percentCValue.innerHTML = formatPercentOfC(spd, true);
  }

  const rawSpeedNum = spd.toNumber();
  const fraction = visualSpeedFraction(rawSpeedNum);
  refs.speedBarFill.style.width = `${Math.round(fraction * 100)}%`;

  const scale = unitScaleForDistance(state.currencies.distanceRun);
  // Ruler tick-step scaling deliberately ignores the click combo (uses
  // generator-only speed) — otherwise every click's transient speed spike
  // reflows the scale bar's step size, reading as a continuous "zoom" jitter.
  const speedInUnitPerSec = toUnitScale(generatorSpeed(state), scale);

  const clickIntensity = state.clickRate / CLICK_RATE_CAP;

  const clickBoost = state.goldenEffects.click;
  const clickFraction = Math.max(0, Math.min(1, clickBoost.secRemaining / GOLDEN_BOOST_DURATION_SEC));
  refs.boostBannerClick.classList.toggle('is-hidden', clickFraction <= 0);
  refs.boostBarFillClick.style.width = `${Math.round(clickFraction * 100)}%`;
  refs.boostMultValue.textContent = `×${GOLDEN_BOOST_MULTIPLIER * clickBoost.stacks}`;

  const speedBoost = state.goldenEffects.speed;
  const speedFraction = Math.max(0, Math.min(1, speedBoost.secRemaining / GOLDEN_BOOST_DURATION_SEC));
  refs.boostBannerSpeed.classList.toggle('is-hidden', speedFraction <= 0);
  refs.boostBarFillSpeed.style.width = `${Math.round(speedFraction * 100)}%`;
  refs.boostSpeedValue.textContent = `+${Math.round(GOLDEN_SPEED_BOOST_PCT * speedBoost.stacks * 100)}%`;

  refs.boostBanner.classList.toggle('is-hidden', clickFraction <= 0 && speedFraction <= 0);

  const goldenBoostFraction = Math.max(clickFraction, speedFraction);

  return {
    visualFraction: fraction,
    clickIntensity,
    ruler: { symbol, distanceInUnit: raw, speedInUnitPerSec },
    goldenBoostFraction,
  };
}

export function hideClickHint(refs: UiRefs): void {
  refs.clickHint.classList.add('is-hidden');
}
