import { D, ZERO } from '../core/decimal';
import { canPrestige, crystalSpeedMultiplier, crystalsOnPrestige } from '../core/logic';
import { lastMilestone, MILESTONES, nextMilestone, type MilestoneDef } from '../core/milestones';
import type { GameState } from '../core/state';
import { formatDistanceStr, formatDuration, formatNumber } from '../core/units';
import type { UiRefs } from './dom';

const RECENT_LOG_SIZE = 4;

/** Rebuild the "recent milestones" log from a count (used on load, so a resumed
 * save shows sensible history instead of an empty list). */
export function initialRecentLog(state: GameState): MilestoneDef[] {
  const count = milestonesReachedCount(state);
  return MILESTONES.slice(Math.max(0, count - RECENT_LOG_SIZE), count).reverse();
}

function milestonesReachedCount(state: GameState): number {
  return MILESTONES.filter((m) => state.currencies.distanceRun.gte(m.planck)).length;
}

export function updateProgress(state: GameState, refs: UiRefs, recentLog: MilestoneDef[]): void {
  const next = nextMilestone(state.currencies.distanceRun);
  const prev = lastMilestone(state.currencies.distanceRun);

  if (next) {
    refs.nextMilestoneName.textContent = next.name;
    refs.nextMilestoneMeta.innerHTML = `${formatDistanceStr(next.planck, true)} — <span class="boost">×2 boost</span>`;
    const lo = prev ? prev.planck : ZERO;
    const span = next.planck.sub(lo);
    const progressed = state.currencies.distanceRun.sub(lo);
    const pct = span.lte(0) ? 100 : Math.max(0, Math.min(100, progressed.div(span).mul(100).toNumber()));
    refs.milestoneBarFill.style.width = `${pct}%`;
    refs.milestonePct.textContent = `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
  } else {
    refs.nextMilestoneName.textContent = 'All milestones reached';
    refs.nextMilestoneMeta.textContent = '';
    refs.milestoneBarFill.style.width = '100%';
    refs.milestonePct.textContent = '100%';
  }

  refs.recentList.innerHTML = recentLog
    .map(
      (m) => `
      <div class="progress__recent-row">
        <span class="progress__recent-check">✓</span>
        <span class="progress__recent-name">${m.name}</span>
        <span class="progress__recent-fill"></span>
        <span class="progress__recent-dist mono">${formatDistanceStr(m.planck, true)}</span>
      </div>`,
    )
    .join('');

  refs.statLifetime.innerHTML = formatDistanceStr(state.currencies.distanceLifetime, true);
  refs.statRuntime.textContent = formatDuration(state.runTimeSec);
  refs.statClicks.innerHTML = formatNumber(D(state.totalClicks), true);
  refs.statPrestigeCount.textContent = String(state.prestigeCount);
  refs.statCrystals.innerHTML = formatNumber(state.currencies.crystals, true);
  refs.statPrestigeMult.innerHTML = `×${formatNumber(crystalSpeedMultiplier(state), true)}`;

  const ready = canPrestige(state);
  refs.prestigePanel.classList.toggle('progress__prestige--ready', ready);
  if (ready) {
    refs.prestigeIcon.textContent = '✦';
    refs.prestigeText.innerHTML = `Prestige — <span class="mono">+${formatNumber(crystalsOnPrestige(state), true)}</span> crystals`;
  } else {
    refs.prestigeIcon.textContent = '🔒';
    refs.prestigeText.innerHTML = 'Prestige — reach <em>c</em>';
  }
}
