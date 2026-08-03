/**
 * Lightweight user feedback: dismissed listing ids and muted role/company
 * patterns. Kept local; the queue filters against these. (Full adaptive
 * preference learning is a later phase — this is the manual layer.)
 */

const K_DISMISSED = "internpilot.ranking.dismissed";
const K_MUTED = "internpilot.ranking.mutedPatterns";

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}
function writeSet(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export function getDismissed(): Set<string> {
  return readSet(K_DISMISSED);
}
export function dismiss(id: string): void {
  const s = getDismissed();
  s.add(id);
  writeSet(K_DISMISSED, s);
}

export function getMutedPatterns(): string[] {
  return [...readSet(K_MUTED)];
}
/** Mute future listings whose title contains this phrase (lower-cased). */
export function mutePattern(phrase: string): void {
  const p = phrase.trim().toLowerCase();
  if (!p) return;
  const s = readSet(K_MUTED);
  s.add(p);
  writeSet(K_MUTED, s);
}
export function unmutePattern(phrase: string): void {
  const s = readSet(K_MUTED);
  s.delete(phrase.trim().toLowerCase());
  writeSet(K_MUTED, s);
}

/** A short "mute similar" phrase derived from a title (its core role words). */
export function similarPhrase(title: string): string {
  const t = title.toLowerCase();
  const m = t.match(/(front[\s-]?end|back[\s-]?end|full[\s-]?stack|machine learning|data (engineer|scien\w*)|security|platform|cloud|devops|\bsre\b|mobile|ios|android|embedded|firmware|hardware|qa|test)/);
  return m ? m[1] : t.split(/\s+/).slice(0, 2).join(" ");
}
