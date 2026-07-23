import { Decimal } from './decimal';
import { metersToPlanck } from './constants';

/**
 * Flavor milestone table — PLACEHOLDER.
 * The canonical ~62-row table lives in the design chat and will replace this
 * wholesale; keep the shape identical: (name, distance in meters).
 *
 * One table drives: the odometer comparison line, milestone popups,
 * the next-milestone tracker, AND the ×2-all-production bonuses.
 * Roughly one row per order of magnitude. Must stay sorted by distance.
 */
export interface MilestoneDef {
  name: string;
  meters: number;
  planck: Decimal;
}

const RAW: Array<[name: string, meters: number]> = [
  ['10 Planck lengths', 1.6e-34],
  ['100 Planck lengths', 1.6e-33],
  ['1000 Planck lengths', 1.6e-32],
  ['10.000 Planck lengths', 1e-31],
  ['100.000 Planck lengths', 1e-30],
  ['1 Million Planck lengths', 1e-29],
  ['10 Million Planck lengths', 1e-28],
  ['100 Million Planck lengths', 4e-27],
  ['1 Billion Planck lengths', 1.6e-26],
  ['Neutrino (upper bound)', 1e-24],
  ['A yoctometer', 1e-23],
  ['Preon scale (hypothetical)', 1e-22],
  ['A zeptometer', 1e-21],
  ['LHC resolution limit', 1e-20],
  ['Quark (upper bound)', 1e-19],
  ['Electron (upper bound)', 1e-18],
  ['Range of the weak force', 1e-17],
  ['Hard gamma wavelength', 1e-16],
  ['Width of a proton', 1.7e-15],
  ['Uranium nucleus', 1.4e-14],
  ['Gamma ray wavelength', 1e-13],
  ["Electron's Compton wavelength", 2.4e-12],
  ['Bohr radius', 5.3e-11],
  ['A hydrogen atom', 1e-10],
  ['A sugar molecule', 1e-9],
  ['Cell membrane thickness', 1e-8],
  ['A virus', 1e-7],
  ['A bacterium', 1e-6],
  ['A red blood cell', 7e-6],
  ['Width of a human hair', 7e-5],
  ['A grain of sand', 5e-4],
  ['An ant', 5e-3],
  ['A coin', 2e-2],
  ['A smartphone', 1.5e-1],
  ['Human height', 1.7],
  ['A blue whale', 30],
  ['A football pitch', 105],
  ['Burj Khalifa', 828],
  ['Mount Everest', 8848],
  ['A marathon', 42_195],
  ['Kármán line — edge of space', 1e5],
  ['Length of Belgium', 3e5],
  ["Earth's diameter", 1.2742e7],
  ['The Moon', 3.844e8],
  ["The Sun's diameter", 1.39e9],
  ["Mercury's orbit", 5.79e10],
  ['The Sun — 1 AU', 1.495978707e11],
  ["Mars's orbit", 2.279e11],
  ["Jupiter's orbit", 7.785e11],
  ["Saturn's orbit", 1.4335e12],
  ["Neptune's orbit — 30 AU", 4.495e12],
  ["Pluto's orbit", 5.9e12],
  ['The heliopause', 1.8e13],
  ['Voyager 1', 2.5e13],
  ['Leaving the Solar System', 1.19e14],
  ['Inner Oort Cloud', 3e14],
  ['One light year', 9.4607e15],
  ['Proxima Centauri', 4.017e16],
  ['Ten light years', 9.4607e16],
  ['A hundred light years', 9.4607e17],
  ['A thousand light years', 9.4607e18],
  ['The galactic center', 2.46e20],
  ['Milky Way diameter', 9.4607e20],
  ['Andromeda galaxy', 2.365e22],
  ['Virgo Supercluster', 5.09e23],
  ['One billion light years', 9.4607e24],
  ['Edge of the observable universe', 4.4e26],
];

export const MILESTONES: MilestoneDef[] = RAW.map(([name, meters]) => ({
  name,
  meters,
  planck: metersToPlanck(meters),
}));

/** Number of milestones reached at a given distance (ℓₚ). Each grants ×2 all production. */
export function milestonesReached(distancePlanck: Decimal): number {
  let lo = 0;
  let hi = MILESTONES.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distancePlanck.gte(MILESTONES[mid]!.planck)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function lastMilestone(distancePlanck: Decimal): MilestoneDef | undefined {
  const n = milestonesReached(distancePlanck);
  return n > 0 ? MILESTONES[n - 1] : undefined;
}

export function nextMilestone(distancePlanck: Decimal): MilestoneDef | undefined {
  return MILESTONES[milestonesReached(distancePlanck)];
}
