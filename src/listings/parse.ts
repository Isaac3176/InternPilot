/** Best-effort text mining over a fetched job description, for the "About the role" UI. */

/** First real sentence of a description, for the pull quote. Empty if too short. */
export function leadSentence(text: string): string {
  const clean = text.replace(/^\s*[•\-*]\s*/, "").replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{40,220}?[.!?])(\s|$)/);
  const s = (m ? m[1] : clean.slice(0, 160)).trim();
  return s.length >= 30 ? s : "";
}

const RESP_HEAD = /responsib|what you'?ll do|what you will do|in this role|day[- ]?to[- ]?day|you will\b/i;
const STOP_HEAD = /requirement|qualification|what we'?re looking for|about you|minimum|preferred|benefit|perk|compensation|equal opportunity|eeo/i;

/** Pull the "responsibilities / what you'll do" bullets out of a JD, if present. */
export function parseDuties(text: string): string[] {
  const out: string[] = [];
  let on = false;
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = /^[•\-*]/.test(line);
    const isHead = !isBullet && line.length <= 64 && !/[.!?]$/.test(line);
    if (!on) { if (isHead && RESP_HEAD.test(line)) on = true; continue; }
    if (isHead && STOP_HEAD.test(line)) break;
    if (isBullet) {
      const b = line.replace(/^[•\-*]\s*/, "").trim();
      if (b.length >= 10 && b.length <= 240) out.push(b);
    }
    if (out.length >= 5) break;
  }
  return out;
}
