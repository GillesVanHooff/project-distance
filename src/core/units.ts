import { D, Decimal } from './decimal';
import {
  PLANCK_METERS,
  METERS_PER_AU,
  METERS_PER_LIGHT_DAY,
  METERS_PER_LIGHT_YEAR,
  C_PLANCK_PER_SEC,
} from './constants';

/**
 * Display unit ladder (CLAUDE.md). One sorted lookup table:
 * pick the last entry whose minimum is at or below the value.
 * All values displayed at 3 significant figures.
 */
interface UnitRow {
  /** Minimum distance in meters for this unit to apply. */
  minMeters: number;
  symbol: string;
  /** Meters per one of this unit. */
  divisor: number;
  /** Use K/M/B suffixes inside this unit's range (km, ly). */
  suffixed?: boolean;
}

const UNIT_LADDER: UnitRow[] = [
  // Planck lengths handled separately below (scientific notation).
  { minMeters: 1e-9, symbol: 'nm', divisor: 1e-9 },
  { minMeters: 1e-6, symbol: 'µm', divisor: 1e-6 },
  { minMeters: 1e-3, symbol: 'mm', divisor: 1e-3 },
  { minMeters: 1e-2, symbol: 'cm', divisor: 1e-2 },
  { minMeters: 1, symbol: 'm', divisor: 1 },
  { minMeters: 1e3, symbol: 'km', divisor: 1e3, suffixed: true }, // runs all the way to 1 AU
  { minMeters: METERS_PER_AU, symbol: 'AU', divisor: METERS_PER_AU },
  { minMeters: 4.6 * METERS_PER_LIGHT_DAY, symbol: 'ld', divisor: METERS_PER_LIGHT_DAY },
  { minMeters: 0.1 * METERS_PER_LIGHT_YEAR, symbol: 'ly', divisor: METERS_PER_LIGHT_YEAR, suffixed: true },
];

const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

/** Format a plain number to 3 significant figures. */
function to3Sig(n: number): string {
  if (n === 0) return '0';
  if (n >= 100) return Math.round(n).toLocaleString('en-US');
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

/** Format with K/M/B/T suffixes, 3 sig figs; falls back to scientific beyond T. */
export function formatNumber(value: Decimal): string {
  if (value.lt(0)) return '-' + formatNumber(value.neg());
  if (value.lt(1000)) {
    const n = value.toNumber();
    // Whole-ish small numbers read chunky (energy is deliberately integral).
    return Number.isInteger(n) ? n.toString() : to3Sig(n);
  }
  const exp = Math.floor(value.log10());
  const tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) {
    const scaled = value.div(D(10).pow(tier * 3)).toNumber();
    return to3Sig(scaled) + SUFFIXES[tier];
  }
  return formatScientific(value);
}

export function formatScientific(value: Decimal): string {
  const exp = Math.floor(value.log10());
  const mantissa = value.div(D(10).pow(exp)).toNumber();
  return `${mantissa.toFixed(2)}×10${toSuperscript(exp)}`;
}

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

function toSuperscript(n: number): string {
  return String(n).split('').map((c) => SUPERSCRIPTS[c] ?? c).join('');
}

export interface FormattedDistance {
  value: string;
  symbol: string;
}

/** Format a distance in Planck lengths using the unit ladder. */
export function formatDistance(planck: Decimal): FormattedDistance {
  const meters = planck.mul(PLANCK_METERS);
  let row: UnitRow | undefined;
  for (const r of UNIT_LADDER) {
    if (meters.gte(r.minMeters)) row = r;
    else break;
  }
  if (!row) {
    // Planck-length range: 1 → 6.25×10²⁵ ℓₚ, scientific notation past 1000.
    const value = planck.lt(1000)
      ? Math.floor(planck.toNumber()).toString()
      : formatScientific(planck);
    return { value, symbol: 'ℓₚ' };
  }
  const inUnit = meters.div(row.divisor);
  const value = row.suffixed ? formatNumber(inUnit) : to3Sig(inUnit.toNumber());
  return { value, symbol: row.symbol };
}

export function formatDistanceStr(planck: Decimal): string {
  const { value, symbol } = formatDistance(planck);
  return `${value} ${symbol}`;
}

/** Format a speed in ℓₚ/s using the distance ladder. */
export function formatSpeed(planckPerSec: Decimal): string {
  return `${formatDistanceStr(planckPerSec)}/s`;
}

/** Percentage of light speed, 4 significant-ish digits for the long crawl (e.g. "0.0007"). */
export function formatPercentOfC(speed: Decimal): string {
  const pct = speed.div(C_PLANCK_PER_SEC).mul(100).toNumber();
  if (pct >= 100) return '100';
  if (pct >= 1) return pct.toFixed(1);
  if (pct >= 0.01) return pct.toFixed(2);
  return pct.toPrecision(1).replace(/e.*$/, (m) => `×10${toSuperscript(Number(m.slice(1)))}`);
}

export function formatDuration(totalSec: number): string {
  const s = Math.floor(totalSec % 60);
  const m = Math.floor((totalSec / 60) % 60);
  const h = Math.floor(totalSec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
