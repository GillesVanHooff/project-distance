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
