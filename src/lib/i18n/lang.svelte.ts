import { store } from '../storage';
import { pickLang } from './pick';
import type { Lang } from './strings';

export const lang = $state<{ current: Lang }>({ current: 'th' });

const apply = (l: Lang) => {
  lang.current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
};

export function initLang() {
  apply(pickLang(store.get('bf:lang') ?? store.get('bf26:lang'), globalThis.navigator?.languages));
}

export function setLang(l: Lang) {
  apply(l);
  store.set('bf:lang', l);
}
