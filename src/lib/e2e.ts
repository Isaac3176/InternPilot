export const E2E_SMOKE = import.meta.env.VITE_E2E_SMOKE === "1";

const PREFIX = "internpilot.e2e.";

export function e2eKey(key: string): string {
  return `${PREFIX}${key}`;
}

export function e2eRead<T>(key: string, fallback: T): T {
  if (!E2E_SMOKE) return fallback;
  try {
    const raw = localStorage.getItem(e2eKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function e2eWrite<T>(key: string, value: T): void {
  if (!E2E_SMOKE) return;
  localStorage.setItem(e2eKey(key), JSON.stringify(value));
}

export function e2eNextId(key: string): number {
  const next = e2eRead(key, 1);
  e2eWrite(key, next + 1);
  return next;
}
