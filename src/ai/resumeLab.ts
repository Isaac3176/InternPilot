/**
 * Résumé Lab: three AI tools over a résumé (± a target job description).
 *   gapFinder    — missing keywords / weak verbs / vague claims vs. what's there
 *   rewriteResume — tailor the résumé to the JD without inventing anything
 *   redFlagScan  — a recruiter's 6-second read: what stands out, what to cut
 * OpenAI when a key is set; deterministic offline heuristics otherwise (except
 * rewrite, which needs the model). Outputs are always shown for review.
 */
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";
import { jdSkillMatch } from "../listings/match";

export type Source = "openai" | "stub";

export interface GapRow { item: string; type: string; have: string }
export interface GapResult { rows: GapRow[]; summary: string; source: Source }
export interface RewriteResult { text: string; source: Source }
export interface RedFlagResult {
  firstImpression: string;
  skipReasons: string[];
  cliches: string[];
  fixes: string[];
  source: Source;
}

const WEAK_VERBS = ["helped", "worked on", "responsible for", "assisted", "participated", "involved in", "handled", "dealt with", "was tasked", "duties included"];
const CLICHES = ["hard-working", "hard working", "team player", "detail-oriented", "detail oriented", "results-driven", "results driven", "go-getter", "self-starter", "think outside the box", "synergy", "fast learner", "passionate", "motivated individual", "proven track record", "dynamic", "wear many hats"];

async function chat<T>(system: string, user: string): Promise<T> {
  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return JSON.parse(data?.choices?.[0]?.message?.content ?? "{}") as T;
}

// ---------- 1. Gap Finder ----------
export async function gapFinder(resume: string, jd: string): Promise<GapResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!jd.trim()) throw new Error("Paste the target job description first.");
  if (!hasApiKey()) {
    const m = jdSkillMatch(jd, resume);
    const rows: GapRow[] = m.missing.map((k) => ({ item: k, type: "keyword", have: "not on your résumé" }));
    for (const v of WEAK_VERBS) if (new RegExp(`\\b${v}\\b`, "i").test(resume)) rows.push({ item: `Weak verb: "${v}"`, type: "weak verb", have: "replace with an action verb" });
    return {
      rows,
      summary: `${m.missing.length} JD keyword(s) missing, ${m.matched.length} already present. Add an OpenAI key for a deeper gap analysis.`,
      source: "stub",
    };
  }
  return {
    ...(await chat<Omit<GapResult, "source">>(
      "You are a resume gap analyst. Compare a resume to a target job description. Identify EVERY gap: missing keywords, weak verbs, vague claims, and skills the JD wants that the resume doesn't mention. Do not invent skills. Respond ONLY with JSON: { \"summary\": string, \"rows\": [{ \"item\": string, \"type\": \"keyword\"|\"weak verb\"|\"vague claim\"|\"missing skill\", \"have\": string }] }.",
      `RESUME:\n${resume.slice(0, 6000)}\n\nJOB DESCRIPTION:\n${jd.slice(0, 6000)}`,
    )),
    source: "openai",
  };
}

// ---------- 2. One-Click Rewrite ----------
export async function rewriteResume(resume: string, jd: string): Promise<RewriteResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!jd.trim()) throw new Error("Paste the target job description first.");
  if (!hasApiKey()) throw new Error("Rewrite needs an OpenAI key — add one in Settings.");
  const out = await chat<{ resume: string }>(
    "You rewrite a student's resume tailored to a specific job description. Mirror the JD's language and priorities, lead with the most relevant experience, and keep it to one page. CRITICAL: do not invent anything — only reposition and rephrase what's already in the resume. Preserve real facts, companies, and dates. Respond ONLY with JSON: { \"resume\": string } where resume is plain text.",
    `CURRENT RESUME:\n${resume.slice(0, 8000)}\n\nTARGET JOB DESCRIPTION:\n${jd.slice(0, 6000)}`,
  );
  return { text: (out.resume ?? "").trim(), source: "openai" };
}

// ---------- 3. Recruiter Red-Flag Scan ----------
export async function redFlagScan(resume: string, jd?: string): Promise<RedFlagResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!hasApiKey()) {
    const found = CLICHES.filter((c) => new RegExp(c.replace(/[-]/g, "[- ]"), "i").test(resume));
    const bullets = resume.split(/\n/).filter((l) => /^[\s]*[-•*]/.test(l));
    const noMetric = bullets.filter((b) => !/\d/.test(b)).length;
    const fixes: string[] = [];
    if (noMetric) fixes.push(`${noMetric} bullet(s) have no number — add a metric (%, count, time saved).`);
    for (const v of WEAK_VERBS) if (new RegExp(`\\b${v}\\b`, "i").test(resume)) { fixes.push(`Replace weak verb "${v}" with an action verb.`); break; }
    if (resume.length > 4200) fixes.push("Reads long for one page — tighten to the strongest points.");
    return {
      firstImpression: "Offline scan — add an OpenAI key for a recruiter-style read.",
      skipReasons: noMetric ? ["Bullets read like duties, not results (missing numbers)."] : [],
      cliches: found,
      fixes: fixes.length ? fixes : ["Looks reasonable on the offline checks — try the AI scan for depth."],
      source: "stub",
    };
  }
  return {
    ...(await chat<Omit<RedFlagResult, "source">>(
      "You are a busy tech recruiter who spends 6 seconds per resume. Read the resume and be brutally specific. Respond ONLY with JSON: { \"firstImpression\": string, \"skipReasons\": string[], \"cliches\": string[], \"fixes\": string[] } — skipReasons = what would make you skip it, cliches = eye-roll phrases to cut, fixes = concrete improvements.",
      `RESUME:\n${resume.slice(0, 8000)}${jd ? `\n\nTARGET ROLE JD (for context):\n${jd.slice(0, 3000)}` : ""}`,
    )),
    source: "openai",
  };
}
