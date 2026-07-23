import { GENERATORS, UPGRADES, UPGRADES_BY_ID } from '../core/content';
import { GENERATOR_DOUBLE_EVERY } from '../core/constants';
import { D, Decimal } from '../core/decimal';
import { generatorCost, generatorUnlocked, globalMultiplier, upgradeNextCost, upgradeUnlocked } from '../core/logic';
import { upgradeLevel, type GameState } from '../core/state';
import { formatDistanceStr, formatNumber, formatSpeed } from '../core/units';
import type { UiRefs } from './dom';

export type ShopTab = 'generators' | 'upgrades' | 'photon';

export function isPhotonUnlocked(state: GameState): boolean {
  const def = UPGRADES_BY_ID.get('photon');
  return def !== undefined && state.currencies.distanceRun.gte(def.unlock);
}

export function setActiveTab(refs: UiRefs, tab: ShopTab): void {
  for (const btn of refs.shopTabs) {
    btn.classList.toggle('is-active', btn.dataset['tab'] === tab);
  }
}

export function renderShop(state: GameState, refs: UiRefs, tab: ShopTab): void {
  refs.photonTabIcon.textContent = isPhotonUnlocked(state) ? '◈' : '⊘';
  const photonTabBtn = refs.shopTabs.find((b) => b.dataset['tab'] === 'photon');
  if (photonTabBtn) photonTabBtn.disabled = !isPhotonUnlocked(state);

  if (tab === 'generators') {
    refs.shopList.innerHTML = renderGenerators(state);
  } else if (tab === 'upgrades') {
    refs.shopList.innerHTML = renderUpgradeList(state, (u) => u.category !== 'photon');
  } else {
    refs.shopList.innerHTML = renderUpgradeList(state, (u) => u.category === 'photon');
  }

  updateTabIndicators(state, refs);
}

// Live affordability of the very next purchase for each item in a tab —
// what actually drives the dot's steady visibility (can the player buy
// *something* right now).
function tabItemAvailability(state: GameState, tab: ShopTab): Map<string, boolean> {
  const result = new Map<string, boolean>();

  if (tab === 'generators') {
    GENERATORS.forEach((_, i) => {
      result.set(`generator:${i}`, generatorUnlocked(state, i) && state.currencies.energy.gte(generatorCost(state, i)));
    });
    return result;
  }

  const filter = tab === 'upgrades' ? (u: (typeof UPGRADES)[number]) => u.category !== 'photon' : (u: (typeof UPGRADES)[number]) => u.category === 'photon';
  for (const def of UPGRADES.filter(filter)) {
    const cost = upgradeNextCost(state, def.id);
    const available =
      upgradeUnlocked(state, def.id) &&
      upgradeLevel(state, def.id) < def.maxLevel &&
      cost !== undefined &&
      state.currencies.energy.gte(cost);
    result.set(`upgrade:${def.id}`, available);
  }
  return result;
}

// Every upgrade level's raw cost in a tab, checked independently of what the
// player has actually bought — e.g. Thruster Calibration is 15/150/1,500/...
// per level (content.ts), so this fires again the moment energy passes 150
// even if level 1 (cost 15) was never purchased. That's deliberate: the shop
// only ever displays the *next real* cost, so blowing past a deeper level's
// cost while still sitting on level 0 is invisible in the UI otherwise.
// Generators are excluded: their ~1.10×-per-unit cost growth (CLAUDE.md)
// would make a rung fire every few seconds of idle clicking.
function tabMilestoneAvailability(state: GameState, tab: ShopTab): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (tab === 'generators') return result;

  const filter = tab === 'upgrades' ? (u: (typeof UPGRADES)[number]) => u.category !== 'photon' : (u: (typeof UPGRADES)[number]) => u.category === 'photon';
  for (const def of UPGRADES.filter(filter)) {
    if (!upgradeUnlocked(state, def.id)) continue;
    for (let level = 1; level <= def.maxLevel; level++) {
      result.set(`upgrade:${def.id}:${level}`, state.currencies.energy.gte(def.cost(level)));
    }
  }
  return result;
}

// Tracks, per item/level, whether it was affordable as of the last render —
// module-level since there's only ever one game/DOM instance per page. Used
// to fire the spark burst only on the rising edge (something *newly*
// crossing its cost — e.g. saving up for level 2 without ever buying level 1
// still fires it again), not on every 250ms refresh tick or for
// thresholds already crossed.
const previousItemAvailability = new Map<string, boolean>();

function updateTabIndicators(state: GameState, refs: UiRefs): void {
  for (const btn of refs.shopTabs) {
    const tabId = btn.dataset['tab'] as ShopTab | undefined;
    const indicator = btn.querySelector<HTMLElement>('[data-indicator]');
    const dot = btn.querySelector<HTMLElement>('[data-dot]');
    if (!tabId || !indicator || !dot) continue;

    const items = tabItemAvailability(state, tabId);
    let anyAvailable = false;
    for (const available of items.values()) {
      if (available) anyAvailable = true;
    }

    // Generators have no separate milestone ladder (see above), so fall
    // back to their live affordability keys for burst edge-detection too.
    const milestones = tabMilestoneAvailability(state, tabId);
    const burstKeys = tabId === 'generators' ? items : milestones;

    let newlyAvailable = false;
    for (const [key, available] of burstKeys) {
      if (available && !previousItemAvailability.get(key)) newlyAvailable = true;
      previousItemAvailability.set(key, available);
    }

    // Always visible while something's buyable — not just when the player
    // is looking at a different tab.
    dot.classList.toggle('is-visible', anyAvailable);

    if (newlyAvailable) {
      // Restart the CSS animation even if a previous burst's classList never
      // got cleared: force a reflow between remove and re-add.
      indicator.classList.remove('is-bursting');
      void indicator.offsetWidth;
      indicator.classList.add('is-bursting');
    }
  }
}

function lockedRow(unlock: Decimal): string {
  return `<div class="shop-item shop-item--locked">🔒 Unlocks at <span class="mono">${formatDistanceStr(unlock, true)}</span></div>`;
}

function renderGenerators(state: GameState): string {
  const mult = globalMultiplier(state);
  const rows = GENERATORS.map((gen, i) => {
    if (!generatorUnlocked(state, i)) return lockedRow(gen.unlock);

    const owned = state.generators[i] ?? 0;
    const cost = generatorCost(state, i);
    const affordable = state.currencies.energy.gte(cost);
    const doublings = Math.floor(owned / GENERATOR_DOUBLE_EVERY);
    const perUnit = gen.baseProd.mul(D(2).pow(doublings)).mul(mult);
    const total = perUnit.mul(owned);
    const cardClass = affordable ? 'shop-item shop-item--affordable' : 'shop-item';
    const detail =
      owned > 0
        ? `${formatSpeed(perUnit, true)} each · total ${formatSpeed(total, true)}`
        : `${formatSpeed(perUnit, true)} each`;

    return `
      <div class="${cardClass}" data-generator-index="${i}">
        <div class="shop-item__row">
          <div class="shop-item__name">${gen.name}</div>
          <div class="shop-item__owned">×${owned}</div>
        </div>
        <div class="shop-item__detail">${detail}</div>
        <button
          type="button"
          class="shop-item__buy ${affordable ? 'shop-item__buy--affordable' : ''}"
          data-action="buy-generator"
          data-index="${i}"
          ${affordable ? '' : 'disabled'}
        >Buy — <span class="mono">${formatNumber(cost, true)}</span> energy</button>
      </div>`;
  });
  return rows.join('') + '<div class="shop__footer-label">← spend</div>';
}

function renderUpgradeList(state: GameState, filter: (u: (typeof UPGRADES)[number]) => boolean): string {
  const rows = UPGRADES.filter(filter).map((def) => {
    if (!upgradeUnlocked(state, def.id)) return lockedRow(def.unlock);

    const level = upgradeLevel(state, def.id);
    if (level >= def.maxLevel) {
      return `
        <div class="shop-item">
          <div class="shop-item__row">
            <div class="shop-item__name">${def.name}</div>
            <div class="shop-item__owned">MAX</div>
          </div>
          <div class="shop-item__detail">${def.describe(level)}</div>
        </div>`;
    }

    const cost = upgradeNextCost(state, def.id) ?? D(0);
    const affordable = state.currencies.energy.gte(cost);
    const cardClass = affordable ? 'shop-item shop-item--affordable' : 'shop-item';
    const levelLabel = def.maxLevel > 1 ? `Lv ${level}/${def.maxLevel}` : '';

    return `
      <div class="${cardClass}" data-upgrade-id="${def.id}">
        <div class="shop-item__row">
          <div class="shop-item__name">${def.name}</div>
          <div class="shop-item__owned">${levelLabel}</div>
        </div>
        <div class="shop-item__detail">${def.describe(level + 1)}</div>
        <button
          type="button"
          class="shop-item__buy ${affordable ? 'shop-item__buy--affordable' : ''}"
          data-action="buy-upgrade"
          data-id="${def.id}"
          ${affordable ? '' : 'disabled'}
        >Buy — <span class="mono">${formatNumber(cost, true)}</span> energy</button>
      </div>`;
  });
  return rows.join('') + '<div class="shop__footer-label">← spend</div>';
}
