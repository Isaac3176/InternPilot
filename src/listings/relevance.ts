/**
 * Pure season/degree relevance filters, shared by the live-ATS detector
 * (release/live.ts) and the ranked feed (listings/service.ts) so both surface the
 * same thing: roles for the user's target season, at their degree level.
 */

/**
 * Season/year match: if the text names year(s) and none is the target year, it's a
 * different cycle → drop it. Text with no year is kept (ambiguous — don't
 * over-filter). A clearly-conflicting season word (target Summer, text Fall) drops.
 */
export function matchesSeason(text: string, targetSeason: string): boolean {
  const t = text.toLowerCase();
  const targetYear = targetSeason.match(/20\d\d/)?.[0];
  const years = t.match(/20\d\d/g);
  if (targetYear && years && years.length > 0 && !years.includes(targetYear)) return false;

  const seasonWords = ["summer", "fall", "autumn", "winter", "spring"];
  const targetWord = targetSeason.toLowerCase().match(/summer|fall|autumn|winter|spring/)?.[0];
  if (targetWord) {
    const mentionsTarget = new RegExp(`\\b${targetWord}\\b`).test(t);
    const mentionsOther = seasonWords.some((s) => s !== targetWord && s !== "autumn" && new RegExp(`\\b${s}\\b`).test(t));
    if (mentionsOther && !mentionsTarget) return false;
  }
  return true;
}

/** True if a title requires a graduate degree (PhD / Master's) an undergrad can't hold. */
export function requiresGradDegree(title: string): boolean {
  const t = ` ${title.toLowerCase()} `;
  return /\bph\.?\s?d\b|\bphd\b|doctoral|post-?doc|graduate student|master'?s|\bmasters\b|\bm\.?eng\b|\bmba\b/.test(t);
}

/** Treat the user as an undergrad unless their profile degree clearly says grad. */
export function isUndergradDegree(degree: string | null | undefined): boolean {
  const d = (degree ?? "").toLowerCase();
  if (!d) return true;
  return !/ph\.?d|doctora|master|\bms\b|\bm\.?eng\b|\bmba\b|graduate/.test(d);
}
