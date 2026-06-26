import { getFunnelRates, getStatusCounts } from "../db/metrics";
import { getApiKey, getModel, hasApiKey } from "./settings";

export interface Strategy {
  headline: string;
  recommendations: string[];
  source: "openai" | "stub";
}

/** Rule-based fallback so the recommendation is useful without an API key. */
function stubStrategy(
  counts: Awaited<ReturnType<typeof getStatusCounts>>,
  rates: Awaited<ReturnType<typeof getFunnelRates>>,
): Strategy {
  const recs: string[] = [];
  const applied = counts.total - counts.interested;

  if (counts.total < 10) {
    recs.push("Increase volume: aim for a steady weekly application target to build a larger pipeline.");
  }
  if (applied >= 10 && rates.oaRate < 15) {
    recs.push("Low OA rate — tailor your resume per role and run the AI resume match before applying.");
  }
  if (counts.oa > 0) {
    recs.push(`You have ${counts.oa} OA(s) in progress — generate prep plans in Interview Prep.`);
  }
  if (counts.interview > 0) {
    recs.push(`Prepare for ${counts.interview} upcoming interview(s); review company experiences for patterns.`);
  }
  if (counts.applied > 0) {
    recs.push(`${counts.applied} application(s) are awaiting a response — consider polite follow-ups after ~1-2 weeks.`);
  }
  if (recs.length === 0) {
    recs.push("Keep applying consistently and log every application so analytics stay accurate.");
  }

  return {
    headline: "Offline strategy (add an OpenAI key in Settings for a tailored plan).",
    recommendations: recs,
    source: "stub",
  };
}

const SYSTEM_PROMPT =
  "You are a career strategist for software engineering internship applicants. Given the " +
  "applicant's funnel metrics, give a short, specific weekly action plan. Be concrete and " +
  "encouraging. Respond ONLY with JSON matching the schema.";

async function openaiStrategy(
  counts: Awaited<ReturnType<typeof getStatusCounts>>,
  rates: Awaited<ReturnType<typeof getFunnelRates>>,
): Promise<Strategy> {
  const prompt = `METRICS:
Total: ${counts.total} | Interested: ${counts.interested} | Applied: ${counts.applied} | OA: ${counts.oa} | Interview: ${counts.interview} | Offer: ${counts.offer} | Rejected: ${counts.rejected}
Response rate: ${rates.responseRate}% | OA rate: ${rates.oaRate}% | Interview rate: ${rates.interviewRate}% | Offer rate: ${rates.offerRate}%

Return JSON: { "headline": string, "recommendations": string[] }`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
        { role: "user", content: prompt },
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
    headline: parsed.headline ?? "",
    recommendations: parsed.recommendations ?? [],
    source: "openai",
  };
}

export async function getStrategyRecommendation(): Promise<Strategy> {
  const counts = await getStatusCounts();
  const rates = await getFunnelRates();
  if (!hasApiKey()) return stubStrategy(counts, rates);
  return openaiStrategy(counts, rates);
}
