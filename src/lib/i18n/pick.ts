import type { Lang } from './strings';

const isLang = (v: unknown): v is Lang => v === 'th' || v === 'en';

export function pickLang(saved: string | null, languages: readonly string[] | undefined): Lang {
  if (isLang(saved)) return saved;
  for (const tag of languages ?? []) {
    const primary = tag.split('-')[0].toLowerCase();
    if (isLang(primary)) return primary;
  }
  return 'en';
}
