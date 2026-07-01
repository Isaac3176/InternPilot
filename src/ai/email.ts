import type { EmailCategory } from "../db/types";
import { EMAIL_CATEGORIES } from "../db/types";
import { getApiKey, getModel, hasApiKey } from "./settings";

export interface EmailClassification {
  category: EmailCategory;
  confidence: number; // 0-1
  reason: string;
  source: "openai" | "stub";
}

export interface EmailToClassify {
  sender?: string | null;
  subject?: string | null;
  body?: string | null;
}

const RULES: { category: EmailCategory; patterns: RegExp[] }[] = [
  { category: "rejection", patterns: [/unfortunately/i, /regret to inform/i, /not (be )?moving forward/i, /will not be proceeding/i, /decided not to/i, /other candidates/i] },
  { category: "offer", patterns: [/pleased to offer/i, /extend(ing)? an offer/i, /offer letter/i, /congratulations.*offer/i] },
  { category: "oa", patterns: [/online assessment/i, /coding challenge/i, /hackerrank/i, /codesignal/i, /codility/i, /take[- ]home/i, /\bOA\b/] },
  { category: "interview", patterns: [/schedule (an|your) interview/i, /interview invitation/i, /next round/i, /phone screen/i, /technical interview/i, /meet with (the|our) team/i] },
  { category: "confirmation", patterns: [/thank you for applying/i, /application (has been )?received/i, /received your application/i, /successfully applied/i] },
  { category: "recruiter", patterns: [/your availability/i, /hop on a call/i, /connect briefly/i, /reach(ing)? out/i, /recruiter/i, /follow(ing)? up/i] },
];

function stubClassify(email: EmailToClassify): EmailClassification {
  const text = `${email.subject ?? ""}\n${email.body ?? ""}`;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { category: rule.category, confidence: 0.6, reason: "Matched keyword rules (offline).", source: "stub" };
    }
  }
  return { category: "other", confidence: 0.4, reason: "No strong signal (offline).", source: "stub" };
}

const SYSTEM_PROMPT =
  "You classify a job-application-related email into exactly one category: " +
  `${EMAIL_CATEGORIES.join(", ")}. ` +
  "confirmation = application received; rejection = declined; oa = online assessment/coding challenge; " +
  "interview = interview invite/scheduling; recruiter = recruiter outreach/follow-up; offer = job offer; " +
  "other = anything else. Respond ONLY with JSON.";

function buildPrompt(email: EmailToClassify): string {
  return `FROM: ${email.sender ?? "(unknown)"}
SUBJECT: ${email.subject ?? "(none)"}
BODY:
${(email.body ?? "").slice(0, 4000)}

Return JSON: { "category": one of [${EMAIL_CATEGORIES.join(", ")}], "confidence": number 0-1, "reason": string }`;
}

async function openaiClassify(email: EmailToClassify): Promise<EmailClassification> {
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
        { role: "user", content: buildPrompt(email) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  const category: EmailCategory = EMAIL_CATEGORIES.includes(parsed.category) ? parsed.category : "other";
  return {
    category,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    reason: parsed.reason ?? "",
    source: "openai",
  };
}

export async function classifyEmail(email: EmailToClassify): Promise<EmailClassification> {
  if (!hasApiKey()) return stubClassify(email);
  return openaiClassify(email);
}
