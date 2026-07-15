import './styles/main.scss';

import { TICK_RATE } from './core/constants';
import { buyGenerator, buyUpgrade, canPrestige, click, prestige, tick } from './core/logic';
import {
  debugAddCrystals,
  debugAddEnergy,
  debugAddSpeed,
  debugForcePrestige,
  debugSkipToNextMilestone,
} from './core/debug';
import { MILESTONES, milestonesReached } from './core/milestones';
import { applyOfflineProgress, deserialize, serialize } from './core/save';
import { newGame, type GameState } from './core/state';
import { formatDistanceStr } from './core/units';
import { queryRefs } from './ui/dom';
import { initialRecentLog, updateProgress } from './ui/progress';
import { renderShop, setActiveTab, type ShopTab } from './ui/shop';
import { hideClickHint, updateStage } from './ui/stage';
import { ParticleScene } from './render/scene';

const SAVE_KEY = 'project-distance-save';
const AUTOSAVE_INTERVAL_MS = 10_000;
const UI_REFRESH_INTERVAL_MS = 250;

function loadOrCreateState(): GameState {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return newGame();
  try {
    const { state, savedAt } = deserialize(raw);
    applyOfflineProgress(state, (Date.now() - savedAt) / 1000);
    return state;
  } catch (err) {
    console.warn('Failed to load save, starting a new game:', err);
    return newGame();
  }
}

function saveState(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serialize(state));
}

function main(): void {
  const refs = queryRefs();
  const state = loadOrCreateState();
  const scene = new ParticleScene(refs.sceneCanvas);

  let activeTab: ShopTab = 'generators';
  let recentLog = initialRecentLog(state);
  let milestoneCount = milestonesReached(state.currencies.distanceRun);
  // Set right before an intentional wipe so the beforeunload/autosave
  // handlers below don't resurrect the old save on their way out.
  let saveSuspended = false;

  function refreshShopAndProgress(): void {
    renderShop(state, refs, activeTab);
    updateProgress(state, refs, recentLog);
  }

  setActiveTab(refs, activeTab);
  refreshShopAndProgress();

  for (const btn of refs.shopTabs) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['tab'] as ShopTab | undefined;
      if (!tab || btn.disabled) return;
      activeTab = tab;
      setActiveTab(refs, activeTab);
      renderShop(state, refs, activeTab);
    });
  }

  refs.shopList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!btn || btn.disabled) return;
    if (btn.dataset['action'] === 'buy-generator') {
      buyGenerator(state, Number(btn.dataset['index']), 1);
    } else if (btn.dataset['action'] === 'buy-upgrade') {
      const id = btn.dataset['id'];
      if (id) buyUpgrade(state, id);
    }
    renderShop(state, refs, activeTab);
  });

  refs.scene.addEventListener('click', (e) => {
    const gained = click(state);
    scene.addClickEffect(e.clientX, e.clientY, `+${formatDistanceStr(gained)}`);
    hideClickHint(refs);
  });

  function onPrestiged(): void {
    recentLog = [];
    milestoneCount = 0;
    activeTab = 'generators';
    setActiveTab(refs, activeTab);
    refreshShopAndProgress();
  }

  refs.prestigePanel.addEventListener('click', () => {
    if (!canPrestige(state)) return;
    prestige(state);
    onPrestiged();
  });

  // Dev-only live-test controls (CLAUDE.md hard rules stay intact for real
  // players: these never render or wire up in a production build).
  if (import.meta.env.DEV) {
    refs.adminBar.classList.add('is-visible');
    refs.adminBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!btn) return;
      switch (btn.dataset['action']) {
        case 'new-game':
          if (confirm('Wipe the current save and start a new game?')) {
            saveSuspended = true;
            localStorage.removeItem(SAVE_KEY);
            location.reload();
          }
          return;
        case 'skip-milestone':
          debugSkipToNextMilestone(state);
          break;
        case 'add-energy':
          debugAddEnergy(state);
          break;
        case 'add-crystals':
          debugAddCrystals(state);
          break;
        case 'add-speed':
          debugAddSpeed(state);
          break;
        case 'force-prestige':
          debugForcePrestige(state);
          onPrestiged();
          return;
        default:
          return;
      }
      refreshShopAndProgress();
    });
  }

  // Fixed-rate logic tick (CLAUDE.md: 10-30 Hz, independent of rendering).
  const tickDt = 1 / TICK_RATE;
  setInterval(() => {
    tick(state, tickDt);

    const count = milestonesReached(state.currencies.distanceRun);
    if (count > milestoneCount) {
      for (let i = milestoneCount; i < count; i++) recentLog.unshift(MILESTONES[i]!);
      recentLog = recentLog.slice(0, 4);
      milestoneCount = count;
    }
  }, tickDt * 1000);

  // Shop affordability + milestone tracker don't need 60fps churn.
  setInterval(refreshShopAndProgress, UI_REFRESH_INTERVAL_MS);

  setInterval(() => {
    if (!saveSuspended) saveState(state);
  }, AUTOSAVE_INTERVAL_MS);
  window.addEventListener('beforeunload', () => {
    if (!saveSuspended) saveState(state);
  });

  let lastFrame = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;

    const { visualFraction, ruler } = updateStage(state, refs);
    scene.setEra(ruler.symbol);
    scene.update(dt, visualFraction, ruler);
    scene.draw();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
