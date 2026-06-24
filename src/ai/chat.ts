import { listApplications } from "../db/applications";
import { getStatusCounts } from "../db/metrics";
import { STATUS_LABELS } from "../db/types";
import { getApiKey, getModel, hasApiKey } from "./settings";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Build a compact, factual snapshot of the user's data to ground the model. */
async function buildContext(): Promise<string> {
  const counts = await getStatusCounts();
  const apps = await listApplications();
  const lines = apps
    .slice(0, 50)
    .map(
      (a) =>
        `- ${a.company_name ?? "Unknown"} · ${a.role_title} · ${STATUS_LABELS[a.status]} · applied ${a.date_applied?.slice(0, 10) ?? "n/a"}`,
    )
    .join("\n");

  return `APPLICATION SUMMARY
Total: ${counts.total} | Applied: ${counts.applied} | OA: ${counts.oa} | Interview: ${counts.interview} | Offer: ${counts.offer} | Rejected: ${counts.rejected}

APPLICATIONS (most recent first):
${lines || "(none yet)"}`;
}

const SYSTEM_PROMPT =
  "You are InternPilot, a career assistant grounded ONLY in the user's stored internship application data. " +
  "Answer concisely and specifically using the provided data snapshot. If the data does not contain the answer, " +
  "say so plainly rather than guessing.";

/** Offline fallback: a deterministic summary so chat works without an API key. */
function stubReply(question: string, context: string): string {
  return (
    "Offline mode (no OpenAI key set). Here's what I can see from your data:\n\n" +
    context +
    `\n\nAdd an OpenAI key in Settings to get a real answer to: "${question}"`
  );
}

export async function askChat(question: string, history: ChatMessage[]): Promise<string> {
  const context = await buildContext();
  if (!hasApiKey()) return stubReply(question, context);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `DATA SNAPSHOT:\n${context}` },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "(no response)";
}
