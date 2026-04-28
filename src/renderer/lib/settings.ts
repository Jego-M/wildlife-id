const PREFIX = "wildlife-id:";

export function getSetting(key: string, fallback: boolean): boolean;
export function getSetting(key: string, fallback: string): string;
export function getSetting(key: string, fallback: boolean | string): boolean | string {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return fallback;
  return typeof fallback === "boolean" ? raw === "true" : raw;
}

export function setSetting(key: string, value: boolean | string): void {
  localStorage.setItem(PREFIX + key, String(value));
}
