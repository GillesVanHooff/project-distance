export interface UiRefs {
  shopList: HTMLElement;
  shopTabs: HTMLButtonElement[];
  photonTabIcon: HTMLElement;
  adminBar: HTMLElement;
  distanceValue: HTMLElement;
  distanceUnit: HTMLElement;
  distanceComparison: HTMLElement;
  energyValue: HTMLElement;
  energyIncome: HTMLElement;
  scene: HTMLElement;
  sceneCanvas: HTMLCanvasElement;
  speedValue: HTMLElement;
  percentCWrap: HTMLElement;
  percentCValue: HTMLElement;
  speedBarFill: HTMLElement;
  clickHint: HTMLElement;
  nextMilestoneName: HTMLElement;
  nextMilestoneMeta: HTMLElement;
  milestoneBarFill: HTMLElement;
  milestonePct: HTMLElement;
  recentList: HTMLElement;
  statLifetime: HTMLElement;
  statRuntime: HTMLElement;
  statClicks: HTMLElement;
  statPrestigeCount: HTMLElement;
  statCrystals: HTMLElement;
  statPrestigeMult: HTMLElement;
  prestigePanel: HTMLElement;
  prestigeIcon: HTMLElement;
  prestigeText: HTMLElement;
}

function req<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function queryRefs(): UiRefs {
  return {
    shopList: req('shop-list'),
    shopTabs: Array.from(document.querySelectorAll<HTMLButtonElement>('.shop__tab[data-tab]')),
    photonTabIcon: req('photon-tab-icon'),
    adminBar: req('admin-bar'),
    distanceValue: req('distance-value'),
    distanceUnit: req('distance-unit'),
    distanceComparison: req('distance-comparison'),
    energyValue: req('energy-value'),
    energyIncome: req('energy-income'),
    scene: req('scene'),
    sceneCanvas: req('scene-canvas'),
    speedValue: req('speed-value'),
    percentCWrap: req('percent-c-wrap'),
    percentCValue: req('percent-c-value'),
    speedBarFill: req('speed-bar-fill'),
    clickHint: req('click-hint'),
    nextMilestoneName: req('next-milestone-name'),
    nextMilestoneMeta: req('next-milestone-meta'),
    milestoneBarFill: req('milestone-bar-fill'),
    milestonePct: req('milestone-pct'),
    recentList: req('recent-list'),
    statLifetime: req('stat-lifetime'),
    statRuntime: req('stat-runtime'),
    statClicks: req('stat-clicks'),
    statPrestigeCount: req('stat-prestige-count'),
    statCrystals: req('stat-crystals'),
    statPrestigeMult: req('stat-prestige-mult'),
    prestigePanel: req('prestige-panel'),
    prestigeIcon: req('prestige-icon'),
    prestigeText: req('prestige-text'),
  };
}
