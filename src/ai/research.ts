import type { ExperienceRow } from "../db/types";
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

export interface ExperienceSummary {
  overview: string;
  commonTopics: string[];
  format: string;
  behavioralThemes: string[];
  difficulty: string;
  tips: string[];
  source: "openai" | "stub";
}

/** Offline aggregation so the summary is useful without an API key. */
function stubSummary(company: string, experiences: ExperienceRow[]): ExperienceSummary {
  const topicCounts = new Map<string, number>();
  for (const e of experiences) {
    for (const raw of (e.topics ?? "").split(/[,;\n]/)) {
      const t = raw.trim().toLowerCase();
      if (t) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const commonTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);

  const diffs = experiences.map((e) => e.difficulty).filter(Boolean) as string[];
  const difficulty = diffs.length
    ? mostCommon(diffs)
    : "unknown";

  return {
    overview: `Offline summary of ${experiences.length} reported experience(s) at ${company}. Add an OpenAI key in Settings for a richer synthesis.`,
    commonTopics,
    format: "See individual experiences below for reported formats.",
    behavioralThemes: [],
    difficulty,
    tips: ["Focus on the most frequently reported topics.", "Review each experience's notes for specifics."],
    source: "stub",
  };
}

function mostCommon(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const SYSTEM_PROMPT =
  "You synthesize multiple reported interview experiences for a company into a single, " +
  "actionable preparation guide for a software engineering internship candidate. " +
  "Be concrete and only use the provided experiences. Respond ONLY with JSON matching the schema.";

function buildPrompt(company: string, experiences: ExperienceRow[]): string {
  const blocks = experiences
    .map(
      (e, i) =>
        `#${i + 1} | role: ${e.role ?? "?"} | source: ${e.source ?? "?"} | difficulty: ${e.difficulty ?? "?"}
topics: ${e.topics ?? "-"}
notes: ${e.summary ?? "-"}`,
    )
    .join("\n\n");

  return `COMPANY: ${company}

REPORTED EXPERIENCES:
${blocks}

Return JSON with this exact shape:
{
  "overview": string,
  "commonTopics": string[],
  "format": string,
  "behavioralThemes": string[],
  "difficulty": string,
  "tips": string[]
}`;
}

async function openaiSummary(company: string, experiences: ExperienceRow[]): Promise<ExperienceSummary> {
  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(company, experiences) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  return {
    overview: parsed.overview ?? "",
    commonTopics: parsed.commonTopics ?? [],
    format: parsed.format ?? "",
    behavioralThemes: parsed.behavioralThemes ?? [],
    difficulty: parsed.difficulty ?? "",
    tips: parsed.tips ?? [],
    source: "openai",
  };
}

export async function summarizeExperiences(
  company: string,
  experiences: ExperienceRow[],
): Promise<ExperienceSummary> {
  if (!hasApiKey()) return stubSummary(company, experiences);
  return openaiSummary(company, experiences);
}
