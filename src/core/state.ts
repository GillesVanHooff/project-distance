import { D, Decimal, ZERO } from './decimal';
import { GENERATORS } from './content';

/**
 * Currency registry — structured as a list because a 4th in-run currency
 * arrives at galactic scale later. Add a row here, not a new field.
 */
export type CurrencyId = 'distanceRun' | 'distanceLifetime' | 'energy' | 'crystals';

export interface CurrencyDef {
  id: CurrencyId;
  name: string;
  resetsOnPrestige: boolean;
}

export const CURRENCIES: CurrencyDef[] = [
  { id: 'distanceRun', name: 'Distance (this run)', resetsOnPrestige: true },
  { id: 'distanceLifetime', name: 'Distance (lifetime)', resetsOnPrestige: false },
  { id: 'energy', name: 'Energy', resetsOnPrestige: true },
  { id: 'crystals', name: 'Time Crystals', resetsOnPrestige: false },
];

/** Golden-catch effect pool (see GOLDEN_EFFECT_IDS in core/logic.ts). */
export type GoldenEffectId = 'click' | 'speed';

export interface GoldenEffectState {
  /** How many times this effect has stacked since its timer was last at 0. */
  stacks: number;
  secRemaining: number;
}

export interface GameState {
  currencies: Record<CurrencyId, Decimal>;
  /** Lifetime-earned crystals — drives the passive speed bonus (spending doesn't reduce it). */
  crystalsLifetime: Decimal;
  /** Owned count per generator, indexed like GENERATORS. */
  generators: number[];
  /** Upgrade id → level purchased (one-shots are level 0/1). */
  upgrades: Record<string, number>;
  /** Time machine level (prestige shop) — each level doubles time compression. */
  timeMachineLevel: number;
  prestigeCount: number;
  totalClicks: number;
  runTimeSec: number;
  /** Burst ability timers (seconds remaining). */
  burstActiveSec: number;
  burstCooldownSec: number;
  /** Golden-catch effects (click boost, speed boost) — like the burst timers,
   * transient and not persisted. Same effect stacks additively on repeat
   * catches; different effects run in parallel with independent timers. */
  goldenEffects: Record<GoldenEffectId, GoldenEffectState>;
  /** Token bucket for click diminishing returns. */
  clickBucket: number;
  /** Live clicks/sec rate meter (leaky bucket: +CLICK_RATE_IMPULSE per click, exponential decay per tick). */
  clickRate: number;
}

export function newGame(): GameState {
  return {
    currencies: {
      distanceRun: ZERO,
      distanceLifetime: ZERO,
      energy: ZERO,
      crystals: ZERO,
    },
    crystalsLifetime: ZERO,
    generators: GENERATORS.map(() => 0),
    upgrades: {},
    timeMachineLevel: 0,
    prestigeCount: 0,
    totalClicks: 0,
    runTimeSec: 0,
    burstActiveSec: 0,
    burstCooldownSec: 0,
    goldenEffects: {
      click: { stacks: 0, secRemaining: 0 },
      speed: { stacks: 0, secRemaining: 0 },
    },
    clickBucket: 5,
    clickRate: 0,
  };
}

export function upgradeLevel(state: GameState, id: string): number {
  return state.upgrades[id] ?? 0;
}

export { D, Decimal };
