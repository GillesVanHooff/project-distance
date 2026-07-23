/**
 * Headless balance simulator (CLAUDE.md: "Tuning is done via a headless simulator").
 *
 * Plays the game with a greedy auto-buyer and prints time-to-c plus every
 * unlock gate. Original targets: semi-active ≈ 3:00, pure idle ≈ 4:30.
 *
 * Balance finding (2026-07): those two targets are structurally incompatible.
 * Idle (0 clicks/sec) never touches the click formula, so its time-to-c is
 * fixed entirely by generator/cost tuning — nerfing clicks cannot speed idle
 * up, only slow active down. With momentum (click-seconds N) maxed at its
 * original ~8, semi-active (2 cps) hit c in 2:30 against an idle time of 47h
 * — a 19x ratio, already inside rule 3's 15-30x band. There's no tuning move
 * that reaches "idle ≈ 4:30" without buffing base (non-click) production,
 * which no longer describes "capping the click multiple" and would itself
 * blow past rule 3's 15-30x floor (~1.5x active/idle).
 *
 * Developer decision: shrink the ratio by slowing active play instead —
 * momentum's max level was cut from 7 to 3 (N caps at 4, not ~8), pulling
 * semi-active to 3:28 against the same 47h idle (~13.6x ratio, just under
 * rule 3's 15x floor by design). Active overshoots the original 3:00 target
 * by ~15 min; idle is unchanged and still an overnight-scale run. If a
 * tighter ratio is wanted, lower MOMENTUM_COSTS further in content.ts (2
 * levels → 4:18/11x, 0 levels → 11:24/4.1x) — each step trades more active
 * runtime for a smaller gap.
 *
 * Usage:
 *   npm run sim                 # semi-active (2 clicks/sec, buys every 2s)
 *   npm run sim -- --idle       # no clicking, buys every 30s
 *   npm run sim -- --cps=4      # custom click rate
 *   npm run sim -- --crystals=5 --tm=2   # project run 2+ pacing
 *   npm run sim -- --cruise=30  # after reaching c, cruise N minutes and report crystals
 */
import { D, type Decimal } from '../src/core/decimal';
import {
  C_PLANCK_PER_SEC,
  PERCENT_C_SPEED_UNLOCK,
  PLANCK_METERS,
} from '../src/core/constants';
import {
  GENERATORS,
  PHOTON_TIERS,
  SHOP_UNLOCK,
  UPGRADES,
} from '../src/core/content';
import { MILESTONES, milestonesReached } from '../src/core/milestones';
import {
  activateBurst,
  buyGenerator,
  buyUpgrade,
  canPrestige,
  click,
  clickSeconds,
  crystalsOnPrestige,
  distanceRate,
  rawSpeed,
  tick,
  upgradeNextCost,
  upgradeUnlocked,
} from '../src/core/logic';
import { newGame, upgradeLevel } from '../src/core/state';
import {
  formatDistanceStr,
  formatDuration,
  formatPercentOfC,
  formatSpeed,
} from '../src/core/units';

interface Args {
  idle: boolean;
  cps: number;
  buyIntervalSec: number;
  maxHours: number;
  crystals: number;
  timeMachines: number;
  cruiseMinutes: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const idle = argv.includes('--idle');
  return {
    idle,
    cps: Number(get('cps') ?? (idle ? 0 : 2)),
    buyIntervalSec: Number(get('buy') ?? (idle ? 30 : 2)),
    maxHours: Number(get('hours') ?? 12),
    crystals: Number(get('crystals') ?? 0),
    timeMachines: Number(get('tm') ?? 0),
    cruiseMinutes: Number(get('cruise') ?? 0),
  };
}

function main(): void {
  const args = parseArgs();
  const state = newGame();
  state.crystalsLifetime = D(args.crystals);
  state.timeMachineLevel = args.timeMachines;

  const events: Array<[timeSec: number, label: string]> = [];
  const seen = new Set<string>();
  const gate = (id: string, condition: boolean, label: string): void => {
    if (condition && !seen.has(id)) {
      seen.add(id);
      events.push([state.runTimeSec, label]);
    }
  };

  const dt = 0.25;
  const maxSec = args.maxHours * 3600;
  let clickCarry = 0;
  let lastBuy = 0;
  let lastMilestones = 0;
  let timeToC = -1;

  while (state.runTimeSec < maxSec) {
    tick(state, dt);

    // Clicking. Idle mode still clicks through the bootstrap (there is no other
    // way to start), then stops for good once the first generator is running.
    const bootstrapping = (state.generators[0] ?? 0) === 0;
    const cps = args.idle ? (bootstrapping ? 2 : 0) : args.cps;
    if (cps > 0) {
      clickCarry += cps * dt;
      while (clickCarry >= 1) {
        click(state);
        clickCarry -= 1;
      }
      if (!args.idle) activateBurst(state); // use Burst whenever ready
    }

    // Auto-buy: upgrades first (multiplicative). Then, like a real player,
    // SAVE for the cheapest pending upgrade if it's within ~10 min of income;
    // otherwise dump the rest into generators high tier → low.
    if (state.runTimeSec - lastBuy >= args.buyIntervalSec) {
      lastBuy = state.runTimeSec;
      for (const u of UPGRADES) {
        while (
          upgradeUnlocked(state, u.id) &&
          upgradeNextCost(state, u.id) !== undefined &&
          state.currencies.energy.gte(upgradeNextCost(state, u.id)!)
        ) {
          if (!buyUpgrade(state, u.id)) break;
        }
      }
      let cheapestPending: Decimal | undefined;
      for (const u of UPGRADES) {
        if (!upgradeUnlocked(state, u.id)) continue;
        const cost = upgradeNextCost(state, u.id);
        if (cost !== undefined && (cheapestPending === undefined || cost.lt(cheapestPending))) {
          cheapestPending = cost;
        }
      }
      const income = distanceRate(state).mul(1 + cps * clickSeconds(state));
      const saveWindowSec = 600;
      const saving =
        cheapestPending !== undefined && cheapestPending.lte(income.mul(saveWindowSec));
      if (!saving) {
        for (let i = GENERATORS.length - 1; i >= 0; i--) {
          buyGenerator(state, i, Number.MAX_SAFE_INTEGER);
        }
      }
    }

    // Gates
    const dist = state.currencies.distanceRun;
    const pctC = (): string => `${formatPercentOfC(rawSpeed(state))}% of c`;
    gate('shop', dist.gte(SHOP_UNLOCK), 'Shop opens (25 ℓₚ)');
    for (const [i, g] of GENERATORS.entries()) {
      gate(`g${i}`, dist.gte(g.unlock), `${g.name} unlocks (${formatDistanceStr(g.unlock)})`);
    }
    gate('mult', dist.gte(D(1e-7 / PLANCK_METERS)), 'Multiplier upgrades unlock (10⁻⁷ m)');
    gate('photon', upgradeUnlocked(state, 'photon'), `Photon Conversion unlocks (${pctC()})`);
    for (let t = 1; t <= PHOTON_TIERS; t++) {
      gate(
        `photon-t${t}`,
        upgradeLevel(state, 'photon') >= t,
        `  · Photon Conversion ${t}/${PHOTON_TIERS} bought (${pctC()})`,
      );
    }
    gate('pctc', rawSpeed(state).gte(PERCENT_C_SPEED_UNLOCK), `% of c display unlocks — 0.01% of c (${pctC()})`);
    gate('c', canPrestige(state), '★ SPEED = c — PRESTIGE AVAILABLE');

    const ms = milestonesReached(dist);
    if (ms > lastMilestones) lastMilestones = ms;

    if (canPrestige(state) && timeToC < 0) {
      timeToC = state.runTimeSec;
      break;
    }
  }

  // Optional cruise at c after reaching it (keeps clicking unless --idle).
  const distanceAtC = state.currencies.distanceRun;
  const crystalsAtC = crystalsOnPrestige(state);
  let cruiseReport = '';
  if (timeToC >= 0 && args.cruiseMinutes > 0) {
    for (let t = 0; t < args.cruiseMinutes * 60; t += 1) {
      tick(state, 1);
      for (let c = 0; c < (args.idle ? 0 : args.cps); c++) click(state);
    }
    cruiseReport = `\nCruise ${args.cruiseMinutes}min at c: distance ${formatDistanceStr(
      state.currencies.distanceRun,
    )}, crystals ${crystalsOnPrestige(state).toString()} (was ${crystalsAtC.toString()} at c)`;
  }

  // Report
  const mode = args.idle ? 'IDLE' : `SEMI-ACTIVE (${args.cps} clicks/sec)`;
  console.log(`\n=== Project Distance sim — ${mode}, buys every ${args.buyIntervalSec}s ===`);
  if (args.crystals > 0 || args.timeMachines > 0) {
    console.log(`    (run 2+ projection: ${args.crystals} crystals, ${args.timeMachines} time machines)`);
  }
  console.log('');
  for (const [t, label] of events) {
    console.log(`  ${formatDuration(t).padStart(8)}  ${label}`);
  }
  console.log('');
  if (timeToC >= 0) {
    console.log(`Time to c: ${formatDuration(timeToC)}`);
    console.log(`Distance at c: ${formatDistanceStr(distanceAtC)} (${distanceAtC.toExponential(2)} ℓₚ)`);
    console.log(`Crystals if prestige at c: ${crystalsAtC.toString()}`);
  } else {
    console.log(`DID NOT reach c within ${args.maxHours}h`);
    console.log(`Final speed: ${formatSpeed(rawSpeed(state))} (${rawSpeed(state).div(C_PLANCK_PER_SEC).mul(100).toExponential(2)}% of c)`);
    console.log(`Final distance: ${formatDistanceStr(state.currencies.distanceRun)}`);
  }
  console.log(`Milestones reached: ${lastMilestones}/${MILESTONES.length}`);
  console.log(`Generators owned: ${state.generators.join(' / ')}`);
  console.log(
    `Upgrades: thruster ${upgradeLevel(state, 'thruster')}, momentum ${upgradeLevel(state, 'momentum')}, ` +
      `multipliers ${Array.from({ length: 11 }, (_, i) => upgradeLevel(state, `mult${i}`)).reduce((a, b) => a + b, 0)}/11, ` +
      `photon ${upgradeLevel(state, 'photon')}/8`,
  );
  console.log(`Total clicks: ${state.totalClicks}${cruiseReport}`);
}

main();
