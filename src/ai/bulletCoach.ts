/**
 * Numbers Interrogation (résumé prompt #3): coach a bullet toward a measurable
 * result. coachQuestion asks ONE specific question to surface a metric; once the
 * student answers, quantifyBullet rewrites the bullet with it — never inventing
 * numbers. OpenAI when a key is set; deterministic offline otherwise.
 */
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

export type Source = "openai" | "stub";

export function hasMetric(text: string | null | undefined): boolean {
  return /\d/.test(text ?? "");
}

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
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const data = await res.json();
  return JSON.parse(data?.choices?.[0]?.message?.content ?? "{}") as T;
}

/** A specific question to help find a number for this bullet. */
export async function coachQuestion(bullet: string): Promise<string> {
  const b = bullet.trim();
  if (!b) throw new Error("Empty bullet.");
  if (!hasApiKey()) return offlineQuestion(b);
  const out = await chat<{ question: string }>(
    "You are a resume coach. The student's bullet has no measurable result. Ask ONE short, specific question that would help them find a metric (a %, count, time, scale, or dollar figure). Do NOT invent numbers. Respond ONLY with JSON: { \"question\": string }.",
    `BULLET: ${b}`,
  );
  return out.question || offlineQuestion(b);
}

function offlineQuestion(b: string): string {
  const t = b.toLowerCase();
  if (/\b(led|managed|mentored|organized|coordinated)\b/.test(t)) return "How many people, teams, or events did this involve?";
  if (/\b(improved|increased|reduced|optimized|cut|sped|accelerated|decreased)\b/.test(t)) return "By how much? (a %, a time saved, or a before→after number)";
  if (/\b(built|created|developed|designed|shipped|launched|implemented)\b/.test(t)) return "At what scale — how many users, requests, or records did it handle?";
  if (/\b(saved|generated|raised)\b/.test(t)) return "How much — in dollars, hours, or count?";
  return "What was the measurable result — a %, a count, time saved, or scale?";
}

/** Rewrite the bullet to include the student's provided metric. */
export async function quantifyBullet(bullet: string, metric: string): Promise<{ text: string; source: Source }> {
  const b = bullet.trim();
  const m = metric.trim();
  if (!b) throw new Error("Empty bullet.");
  if (!m) throw new Error("Add the number/metric first.");
  if (!hasApiKey()) {
    // Weave the metric in simply; the student can refine.
    const base = b.replace(/[.\s]+$/, "");
    const woven = /\d/.test(m) && m.length < 40 ? `${base} — ${m}.` : `${base}, ${m}.`;
    return { text: woven, source: "stub" };
  }
  const out = await chat<{ bullet: string }>(
    "Rewrite the résumé bullet to naturally include the metric the student provides. Keep it to ONE line, start with a strong action verb, stay truthful (use only the provided number), and don't pad. Respond ONLY with JSON: { \"bullet\": string }.",
    `BULLET: ${b}\nMETRIC THE STUDENT PROVIDED: ${m}`,
  );
  return { text: (out.bullet ?? "").trim() || b, source: "openai" };
}
