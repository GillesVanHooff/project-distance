import './styles/main.scss';

import { TICK_RATE } from './core/constants';
import { D, type Decimal } from './core/decimal';
import {
  activateRandomGoldenEffect,
  buyGenerator,
  buyUpgrade,
  canPrestige,
  click,
  prestige,
  tick,
} from './core/logic';
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
import { hideOfflineOverlay, showOfflineOverlay } from './ui/offline';
import { initialRecentLog, updateProgress } from './ui/progress';
import { renderShop, setActiveTab, type ShopTab } from './ui/shop';
import { hideClickHint, updateStage } from './ui/stage';
import { ParticleScene } from './render/scene';

const SAVE_KEY = 'project-distance-save';
const AUTOSAVE_INTERVAL_MS = 10_000;
const UI_REFRESH_INTERVAL_MS = 250;

interface LoadedGame {
  state: GameState;
  offlineGain: Decimal;
  offlineElapsedSec: number;
}

function loadOrCreateState(): LoadedGame {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return { state: newGame(), offlineGain: D(0), offlineElapsedSec: 0 };
  try {
    const { state, savedAt } = deserialize(raw);
    const offlineElapsedSec = (Date.now() - savedAt) / 1000;
    const offlineGain = applyOfflineProgress(state, offlineElapsedSec);
    return { state, offlineGain, offlineElapsedSec };
  } catch (err) {
    console.warn('Failed to load save, starting a new game:', err);
    return { state: newGame(), offlineGain: D(0), offlineElapsedSec: 0 };
  }
}

function saveState(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serialize(state));
}

function main(): void {
  const refs = queryRefs();
  const { state, offlineGain, offlineElapsedSec } = loadOrCreateState();
  const scene = new ParticleScene(refs.sceneCanvas);

  // Blocks shop/prestige/scene interaction until the offline-progress
  // overlay (if shown) is dismissed via its "Okay" button.
  let inputLocked = offlineGain.gt(0);
  if (inputLocked) {
    showOfflineOverlay(refs, offlineGain, offlineElapsedSec);
    refs.appRoot.classList.add('is-offline-locked');
  }
  // Overlay sits inside the scene (the click target); swallow clicks here so
  // dismissing it doesn't also register as a click-to-accelerate.
  refs.offlineOverlay.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('[data-action="offline-ok"]')) {
      inputLocked = false;
      refs.appRoot.classList.remove('is-offline-locked');
      hideOfflineOverlay(refs);
    }
  });

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
      if (inputLocked) return;
      const tab = btn.dataset['tab'] as ShopTab | undefined;
      if (!tab || btn.disabled) return;
      activeTab = tab;
      setActiveTab(refs, activeTab);
      renderShop(state, refs, activeTab);
    });
  }

  // Buy on pointerdown, not click: renderShop rebuilds shopList.innerHTML every
  // UI_REFRESH_INTERVAL_MS, so a held-down press can outlive the button node a
  // 'click' would need at release time, silently swallowing the purchase.
  refs.shopList.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || inputLocked) return;
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
    if (inputLocked) return;
    const gained = click(state);
    scene.addClickEffect(e.clientX, e.clientY, `+${formatDistanceStr(gained)}`);
    hideClickHint(refs);
  });

  // Mouse-follow: the particle chases the pointer anywhere over the scene,
  // and eases back to its normal idle drift the moment the pointer leaves —
  // off the canvas edge, onto a side menu, or out of the window entirely.
  refs.scene.addEventListener('pointermove', (e) => {
    if (inputLocked) return;
    const rect = refs.sceneCanvas.getBoundingClientRect();
    scene.setPointer(e.clientX - rect.left, e.clientY - rect.top);
  });
  refs.scene.addEventListener('pointerleave', () => scene.setPointer(null, null));
  window.addEventListener('blur', () => scene.setPointer(null, null));

  function onPrestiged(): void {
    recentLog = [];
    milestoneCount = 0;
    activeTab = 'generators';
    setActiveTab(refs, activeTab);
    refreshShopAndProgress();
  }

  refs.prestigePanel.addEventListener('click', () => {
    if (inputLocked || !canPrestige(state)) return;
    prestige(state);
    onPrestiged();
  });

  // Dev-only live-test controls (CLAUDE.md hard rules stay intact for real
  // players: these never render or wire up in a production build).
  if (import.meta.env.DEV) {
    refs.adminBar.classList.add('is-visible');
    refs.adminBar.addEventListener('click', (e) => {
      if (inputLocked) return;
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

    const { visualFraction, clickIntensity, ruler, goldenBoostFraction } = updateStage(state, refs);
    scene.setEra(ruler.symbol);
    scene.update(dt, visualFraction, clickIntensity, ruler, goldenBoostFraction);
    if (!inputLocked && scene.consumeGoldenCatch()) activateRandomGoldenEffect(state);
    scene.draw();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
