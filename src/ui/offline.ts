import type { Decimal } from '../core/decimal';
import { formatDistanceStr, formatDuration, formatNumber } from '../core/units';
import type { UiRefs } from './dom';

/** Show the welcome-back overlay with the distance/energy gained while away. */
export function showOfflineOverlay(refs: UiRefs, gain: Decimal, elapsedSec: number): void {
  refs.offlineDuration.textContent = formatDuration(elapsedSec);
  refs.offlineDistance.innerHTML = formatDistanceStr(gain, true);
  refs.offlineEnergy.innerHTML = formatNumber(gain, true);
  refs.offlineOverlay.classList.remove('is-hidden');
}

export function hideOfflineOverlay(refs: UiRefs): void {
  refs.offlineOverlay.classList.add('is-hidden');
}
