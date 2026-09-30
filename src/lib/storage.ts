export type KV = { get(k: string): string | null; set(k: string, v: string): void };

export function makeStore(ls: () => Storage | undefined): KV {
  return {
    get(k) {
      try {
        return ls()?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        ls()?.setItem(k, v);
      } catch {
        return;
      }
    },
  };
}

export const store = makeStore(() => globalThis.localStorage);
