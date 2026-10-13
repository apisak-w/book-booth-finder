import type { Fix } from '$lib/core/locate';
import type { LocState } from './locate';

export class Locator {
  state = $state<LocState>('idle');
  fix = $state<Fix | null>(null);
  fixAt = $state(0);
  #id: number | null = null;
  #paused = false;
  #onVis = () => {
    if (document.hidden && this.#id !== null) {
      this.#clear();
      this.#paused = true;
    } else if (!document.hidden && this.#paused) {
      this.#paused = false;
      this.#watch();
    }
  };

  start() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.state = 'unavailable';
      return;
    }
    this.#clear();
    this.state = 'asking';
    this.fix = null;
    document.addEventListener('visibilitychange', this.#onVis);
    this.#watch();
  }

  stop(next: LocState = 'idle') {
    this.#clear();
    this.#paused = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.#onVis);
    this.fix = null;
    this.fixAt = 0;
    this.state = next;
  }

  #watch() {
    this.#id = navigator.geolocation.watchPosition(
      (p) => {
        this.state = 'on';
        this.fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        this.fixAt = Date.now();
      },
      (e) => {
        if (e.code === 1) this.stop('denied');
        else if (!this.fix) this.stop('unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  #clear() {
    if (this.#id !== null) navigator.geolocation.clearWatch(this.#id);
    this.#id = null;
  }
}
