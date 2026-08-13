/**
 * Pull work/project experiences and their bullet points out of a résumé so they
 * can be imported into the Experiences list and Bullet Library. OpenAI when a key
 * is set (much better at grouping bullets under the right role); a deterministic
 * heuristic otherwise. Never invents content — it only lifts what's on the page.
 */
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

export interface ExtractedExp {
  company: string;
  role: string;
  summary: string;
  bullets: string[];
}

const BULLET_RE = /^[\s]*[•\-*▪◦·‣–—]\s+/;
// Bullets in real résumés almost always start with a past-tense action verb; PDF
// extraction frequently drops the bullet glyph, so we detect them this way too.
const ACTION_VERB = /^(built|created|developed|designed|shipped|launched|led|implemented|improved|increased|reduced|optimi[sz]ed|automated|architected|engineered|delivered|deployed|scaled|migrated|refactored|analy[sz]ed|drove|owned|initiated|spearheaded|managed|collaborated|wrote|programmed|debugged|integrated|maintained|researched|tested|achieved|coordinated|facilitated|streamlined|enhanced|established|generated|investigated|resolved|supported|trained|utili[sz]ed|contributed|enabled|executed|performed|produced|reviewed|constructed|configured|handled|assisted|helped|worked)\b/i;
const EXP_SECTION = /\b(experience|employment|work history|projects?|professional experience|relevant experience)\b/i;
const STOP_SECTION = /\b(education|skills|technical skills|certifications?|awards?|interests|references|coursework|activities|leadership|volunteer|summary|objective|publications?|languages)\b/i;

/**
 * Offline heuristic, hardened for PDF-extracted text (which usually loses bullet
 * glyphs): normalise inline bullets, skip Education/Skills sections, and treat a
 * line as a bullet if it's glyph-led, verb-led, or a substantial quantified line.
 */
function stubExtract(text: string): ExtractedExp[] {
  const lines = text.replace(/\s*[•▪◦‣·]\s+/g, "\n").split(/\r?\n/).map((l) => l.trim());
  const exps: ExtractedExp[] = [];
  let cur: ExtractedExp | null = null;
  let inStop = false;

  const isHeading = (l: string) => l.length <= 64 && /[A-Za-z]/.test(l) && !/[.]$/.test(l);

  for (const line of lines) {
    if (!line) continue;

    // Section tracking (a short heading toggles whether we're in an experience block).
    if (isHeading(line) && line.split(/\s+/).length <= 5) {
      if (STOP_SECTION.test(line)) { inStop = true; cur = null; continue; }
      if (EXP_SECTION.test(line)) { inStop = false; cur = null; continue; }
    }
    if (inStop) continue;

    const clean = line.replace(BULLET_RE, "").trim();
    const looksBullet = BULLET_RE.test(line) || ACTION_VERB.test(clean) || (clean.length >= 45 && /\d|%/.test(clean));

    if (looksBullet && clean.length >= 8) {
      if (!cur) { cur = { company: "Experience", role: "", summary: "", bullets: [] }; exps.push(cur); }
      cur.bullets.push(clean);
    } else if (isHeading(line)) {
      const parts = line.split(/\s[|•–—@]\s|\s{2,}|,\s/).map((s) => s.trim()).filter(Boolean);
      cur = { company: parts[0] ?? line, role: parts[1] ?? "", summary: "", bullets: [] };
      exps.push(cur);
    }
  }
  return exps.filter((e) => e.bullets.length > 0);
}

async function openaiExtract(text: string): Promise<ExtractedExp[]> {
  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You extract the work and project experiences from a résumé, with each experience's bullet points grouped under it. Use ONLY text present in the résumé — never invent companies, roles, metrics, or bullets. Keep each bullet's original wording. Respond ONLY with JSON: { \"experiences\": [{ \"company\": string, \"role\": string, \"summary\": string, \"bullets\": string[] }] }. summary may be an empty string." },
        { role: "user", content: `RESUME:\n${text.slice(0, 9000)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  const raw = Array.isArray(parsed?.experiences) ? parsed.experiences : [];
  const exps: ExtractedExp[] = raw.map((e: Record<string, unknown>) => ({
    company: String(e.company ?? "").trim(),
    role: String(e.role ?? "").trim(),
    summary: String(e.summary ?? "").trim(),
    bullets: Array.isArray(e.bullets) ? e.bullets.map((b) => String(b).trim()).filter(Boolean) : [],
  })).filter((e: ExtractedExp) => e.bullets.length > 0);
  return exps.length ? exps : stubExtract(text);
}

export async function extractExperiences(text: string): Promise<ExtractedExp[]> {
  if (!text.trim()) return [];
  if (!hasApiKey()) return stubExtract(text);
  try { return await openaiExtract(text); } catch { return stubExtract(text); }
}
