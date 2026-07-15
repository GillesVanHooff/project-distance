import { D, Decimal } from './decimal';
import { OFFLINE_CAP_SEC, OFFLINE_CHUNKS } from './constants';
import { GENERATORS } from './content';
import { newGame, type GameState } from './state';
import { tick } from './logic';

/** Save schema is versioned from the first save ever written. Bump on breaking changes. */
export const SAVE_VERSION = 1;

interface SaveV1 {
  version: 1;
  savedAt: number; // epoch ms
  currencies: Record<string, string>;
  crystalsLifetime: string;
  generators: number[];
  upgrades: Record<string, number>;
  timeMachineLevel: number;
  prestigeCount: number;
  totalClicks: number;
  runTimeSec: number;
}

export function serialize(state: GameState, now = Date.now()): string {
  const save: SaveV1 = {
    version: SAVE_VERSION,
    savedAt: now,
    currencies: {
      distanceRun: state.currencies.distanceRun.toString(),
      distanceLifetime: state.currencies.distanceLifetime.toString(),
      energy: state.currencies.energy.toString(),
      crystals: state.currencies.crystals.toString(),
    },
    crystalsLifetime: state.crystalsLifetime.toString(),
    generators: [...state.generators],
    upgrades: { ...state.upgrades },
    timeMachineLevel: state.timeMachineLevel,
    prestigeCount: state.prestigeCount,
    totalClicks: state.totalClicks,
    runTimeSec: state.runTimeSec,
  };
  return JSON.stringify(save);
}

export interface LoadResult {
  state: GameState;
  savedAt: number;
}

/** Parse a save string. Throws on malformed or future-versioned saves. */
export function deserialize(json: string): LoadResult {
  const raw = JSON.parse(json) as SaveV1;
  if (raw.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${String(raw.version)}`);
  }
  const state = newGame();
  const num = (s: string | undefined): Decimal => (s !== undefined ? D(s) : D(0));
  state.currencies.distanceRun = num(raw.currencies['distanceRun']);
  state.currencies.distanceLifetime = num(raw.currencies['distanceLifetime']);
  state.currencies.energy = num(raw.currencies['energy']);
  state.currencies.crystals = num(raw.currencies['crystals']);
  state.crystalsLifetime = num(raw.crystalsLifetime);
  state.generators = GENERATORS.map((_, i) => raw.generators[i] ?? 0);
  state.upgrades = { ...raw.upgrades };
  state.timeMachineLevel = raw.timeMachineLevel ?? 0;
  state.prestigeCount = raw.prestigeCount ?? 0;
  state.totalClicks = raw.totalClicks ?? 0;
  state.runTimeSec = raw.runTimeSec ?? 0;
  return { state, savedAt: raw.savedAt ?? Date.now() };
}

/**
 * Full offline progress, capped at 30 days. Simulated in chunks so
 * milestone ×2s earned mid-offline compound like they would live.
 * Returns the distance gained (for the welcome-back banner).
 */
export function applyOfflineProgress(state: GameState, elapsedSec: number): Decimal {
  const total = Math.min(Math.max(elapsedSec, 0), OFFLINE_CAP_SEC);
  if (total < 1) return D(0);
  const before = state.currencies.distanceRun;
  const chunk = total / OFFLINE_CHUNKS;
  for (let i = 0; i < OFFLINE_CHUNKS; i++) tick(state, chunk);
  return state.currencies.distanceRun.sub(before);
}
