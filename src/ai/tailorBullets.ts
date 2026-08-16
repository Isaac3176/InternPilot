/**
 * AI rewrite suggestions for tailoring bullets to a job. Given your bullets and the
 * JD skills no bullet currently surfaces, it proposes rewrites of EXISTING bullets
 * that make relevant experience explicit — strictly grounded, never inventing tools
 * or metrics you didn't mention. OpenAI-only (rewriting needs the model).
 */
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

export interface BulletRewrite {
  original: string;
  suggested: string;
  addresses: string[]; // gap skills this rewrite surfaces
}

export async function suggestBulletRewrites(
  jd: string,
  bullets: string[],
  gaps: string[],
): Promise<BulletRewrite[]> {
  if (!hasApiKey()) throw new Error("Rewrite suggestions need an OpenAI key — add one in Settings.");
  if (bullets.length === 0) throw new Error("No bullets to work from — add some in your Bullet Library first.");
  if (gaps.length === 0) return [];

  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You tailor a student's resume bullets to a target job. You are given their EXISTING bullets and a list of skills the job wants that no bullet currently mentions. For each bullet where it is genuinely plausible, rewrite it to surface one or more of the missing skills — but ONLY if the original work plausibly involved that skill. NEVER invent tools, technologies, numbers, or achievements the student didn't do. If a gap can't be honestly addressed by any bullet, omit it. Keep each rewrite one line, action-verb-led, and specific. Respond ONLY with JSON: { \"rewrites\": [{ \"original\": string, \"suggested\": string, \"addresses\": string[] }] }.",
        },
        {
          role: "user",
          content: `TARGET JOB:\n${jd.slice(0, 4000)}\n\nMISSING SKILLS THE JOB WANTS:\n${gaps.join(", ")}\n\nMY BULLETS:\n${bullets.slice(0, 25).map((b, i) => `${i + 1}. ${b}`).join("\n")}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  const raw = Array.isArray(parsed?.rewrites) ? parsed.rewrites : [];
  return raw
    .map((r: any) => ({
      original: String(r.original ?? "").trim(),
      suggested: String(r.suggested ?? "").trim(),
      addresses: Array.isArray(r.addresses) ? r.addresses.map((s: any) => String(s)) : [],
    }))
    .filter((r: BulletRewrite) => r.suggested);
}
