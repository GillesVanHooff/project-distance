import { D, Decimal } from './decimal';
import {
  PLANCK_METERS,
  METERS_PER_AU,
  METERS_PER_KM,
  METERS_PER_LIGHT_DAY,
  METERS_PER_LIGHT_YEAR,
  C_METERS_PER_SEC,
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

/** Format with K/M/B/T suffixes, 3 sig figs; falls back to scientific beyond T.
 * `html`: emit the exponent as a real `<sup>` element (for DOM display via
 * innerHTML) instead of a Unicode superscript character (for canvas fillText,
 * which can't render markup — see formatMagnitude). */
export function formatNumber(value: Decimal, html = false): string {
  if (value.lt(0)) return '-' + formatNumber(value.neg(), html);
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
  return formatScientific(value, html);
}

export function formatScientific(value: Decimal, html = false): string {
  const exp = Math.floor(value.log10());
  const mantissa = value.div(D(10).pow(exp)).toNumber();
  return `${mantissa.toFixed(2)}×10${html ? `<sup>${exp}</sup>` : toSuperscript(exp)}`;
}

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

function toSuperscript(n: number): string {
  return String(n).split('').map((c) => SUPERSCRIPTS[c] ?? c).join('');
}

function findUnitRow(meters: Decimal): UnitRow | undefined {
  let row: UnitRow | undefined;
  for (const r of UNIT_LADDER) {
    if (meters.gte(r.minMeters)) row = r;
    else break;
  }
  return row;
}

export interface UnitScale {
  symbol: string;
  /** Meters per one of this unit — for converting other planck-based quantities (e.g. speed) into it. */
  metersPerUnit: number;
}

/** Which unit row currently applies to a distance, exposed so callers (e.g. the
 * particle-scene ruler) can convert other planck-based quantities into the same
 * unit the odometer is displaying, without duplicating the ladder lookup. */
export function unitScaleForDistance(planck: Decimal): UnitScale {
  const row = findUnitRow(planck.mul(PLANCK_METERS));
  return row ? { symbol: row.symbol, metersPerUnit: row.divisor } : { symbol: 'ℓₚ', metersPerUnit: PLANCK_METERS };
}

/** Convert a planck-based quantity (distance, speed, ...) into a given unit scale. */
export function toUnitScale(planck: Decimal, scale: UnitScale): number {
  return planck.mul(PLANCK_METERS).div(scale.metersPerUnit).toNumber();
}

export interface FormattedDistance {
  value: string;
  symbol: string;
  /** Numeric value in the displayed unit, un-suffixed (e.g. 45231900 for "45.2M km"). */
  raw: number;
}

/** Format a distance in Planck lengths using the unit ladder. See formatNumber
 * for the `html` flag (real `<sup>` vs. Unicode superscript for canvas). */
export function formatDistance(planck: Decimal, html = false): FormattedDistance {
  const meters = planck.mul(PLANCK_METERS);
  const row = findUnitRow(meters);
  if (!row) {
    // Planck-length range: 1 → 6.25×10²⁵ ℓₚ, scientific notation past 1000.
    const value = planck.lt(1000)
      ? Math.floor(planck.toNumber()).toString()
      : formatScientific(planck, html);
    return { value, symbol: 'ℓₚ', raw: planck.toNumber() };
  }
  const inUnit = meters.div(row.divisor);
  const raw = inUnit.toNumber();
  const value = row.suffixed ? formatNumber(inUnit, html) : to3Sig(raw);
  return { value, symbol: row.symbol, raw };
}

/** Format a plain (already unit-scaled) magnitude with K/M/B/T suffixes — used by
 * the scene ruler, which works in plain numbers rather than Decimal since values
 * are already bounded to the current display unit's safe range. */
export function formatMagnitude(n: number): string {
  if (n < 0) return '-' + formatMagnitude(-n);
  if (n === 0) return '0';
  if (n < 1000) return Number.isInteger(n) ? n.toString() : to3Sig(n);
  const exp = Math.floor(Math.log10(n));
  const tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) {
    const scaled = n / 10 ** (tier * 3);
    return to3Sig(scaled) + SUFFIXES[tier];
  }
  const mantissa = n / 10 ** exp;
  return `${mantissa.toFixed(2)}×10${toSuperscript(exp)}`;
}

export function formatDistanceStr(planck: Decimal, html = false): string {
  const { value, symbol } = formatDistance(planck, html);
  return `${value} ${symbol}`;
}

/** Format a speed in ℓₚ/s using the distance ladder. */
export function formatSpeed(planckPerSec: Decimal, html = false): string {
  const meters = planckPerSec.mul(PLANCK_METERS);
  // Once travel is fast enough to read in km/s, stay pinned there all the way
  // to c (~300,000 km/s) instead of collapsing into an abstract "162K km/s" —
  // a plain, fully-written kilometers-per-second number reads as a more
  // visceral pace than a suffixed magnitude. Bounded to <= c: production
  // figures elsewhere (e.g. the shop's per-generator rate) can run far beyond
  // that and still want the full unit ladder + suffixes for readability.
  if (meters.gte(METERS_PER_KM) && meters.lte(C_METERS_PER_SEC)) {
    return `${to3Sig(meters.div(METERS_PER_KM).toNumber())} km/s`;
  }
  return `${formatDistanceStr(planckPerSec, html)}/s`;
}

/** Percentage of light speed, 4 significant-ish digits for the long crawl (e.g. "0.0007"). */
export function formatPercentOfC(speed: Decimal, html = false): string {
  const pct = speed.div(C_PLANCK_PER_SEC).mul(100).toNumber();
  if (pct >= 100) return '100';
  if (pct >= 1) return pct.toFixed(1);
  if (pct >= 0.01) return pct.toFixed(2);
  return pct.toPrecision(1).replace(/e.*$/, (m) => {
    const exp = Number(m.slice(1));
    return `×10${html ? `<sup>${exp}</sup>` : toSuperscript(exp)}`;
  });
}

export function formatDuration(totalSec: number): string {
  const s = Math.floor(totalSec % 60);
  const m = Math.floor((totalSec / 60) % 60);
  const h = Math.floor(totalSec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
