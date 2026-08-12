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

const SECTION_RE = /^(summary|objective|education|skills|technical skills|coursework|certifications|awards|interests|references|contact)\b/i;
const BULLET_RE = /^[\s]*[•\-*▪◦·‣–]\s+/;

/** Offline heuristic: group bullet lines under the nearest preceding header line. */
function stubExtract(text: string): ExtractedExp[] {
  const lines = text.split(/\r?\n/);
  const exps: ExtractedExp[] = [];
  let cur: ExtractedExp | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (BULLET_RE.test(line)) {
      const b = line.replace(BULLET_RE, "").trim();
      if (b.length >= 8) {
        if (!cur) { cur = { company: "Experience", role: "", summary: "", bullets: [] }; exps.push(cur); }
        cur.bullets.push(b);
      }
      continue;
    }

    // A non-bullet, reasonably short line starts a new experience — unless it's a
    // top-level résumé section heading.
    if (line.length <= 90 && /[A-Za-z]/.test(line) && !SECTION_RE.test(line)) {
      const parts = line.split(/\s[|•–—@]\s|\s{2,}|,\s/).map((s) => s.trim()).filter(Boolean);
      cur = { company: parts[0] ?? line, role: parts[1] ?? "", summary: "", bullets: [] };
      exps.push(cur);
    }
  }
  // Keep only entries that actually have bullets.
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
