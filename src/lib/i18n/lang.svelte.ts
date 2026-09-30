import { store } from '../storage';
import type { Lang } from './strings';

export const lang = $state<{ current: Lang }>({ current: 'th' });

const apply = (l: Lang) => {
  lang.current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
};

export function initLang() {
  apply((store.get('bf:lang') ?? store.get('bf26:lang')) === 'en' ? 'en' : 'th');
}

export function setLang(l: Lang) {
  apply(l);
  store.set('bf:lang', l);
}
