/**
 * Answer vault: reviewed, reusable answers to the recurring free-text questions
 * on applications (why-company, why-role, a challenging project, …). Stored
 * locally; surfaced in the application packet and pushed to the browser
 * extension so it can fill matching essay/short-answer fields.
 */

export interface ApplicationAnswer {
  id: string;
  category: string;
  question: string; // human-readable prompt
  answer: string;
  pattern: string; // case-insensitive regex source used to match a form's question
  approved: boolean; // only approved + non-empty answers are reused
  lastReviewedAt: string | null;
}

const KEY = "internpilot.answers";
const SEED_FLAG = "internpilot.answers.seeded";

// Common questions to get the user started (empty answers, unapproved).
const SEED: Omit<ApplicationAnswer, "id" | "answer" | "approved" | "lastReviewedAt">[] = [
  { category: "Motivation", question: "Why do you want to work at this company?", pattern: "why.*(company|work here|join us|interested in (working|us)|want to work)" },
  { category: "Motivation", question: "Why are you interested in this role?", pattern: "why.*(role|position|this job)|interested in the (role|position)" },
  { category: "Experience", question: "Describe a technically challenging project.", pattern: "challeng|difficult (project|problem)|technical project|most proud|hardest" },
  { category: "Experience", question: "Describe a leadership or teamwork experience.", pattern: "leader|teamwork|worked (in|on) a team|conflict|collaborat" },
  { category: "About", question: "Tell us about yourself.", pattern: "about yourself|tell us about you|introduce yourself" },
  { category: "Goals", question: "What are you looking for in an internship?", pattern: "looking for in (an|this)|hope to (gain|learn|achieve)|career goals|what do you want to (learn|gain)" },
  { category: "Strengths", question: "What is your greatest strength?", pattern: "greatest strength|your strength|strongest skill" },
  { category: "Fit", question: "What makes you a good fit?", pattern: "good fit|why should we (hire|choose)|what makes you|stand ?out" },
];

let idc = 0;
function newId(): string {
  idc += 1;
  return `ans-${Date.now().toString(36)}-${idc}`;
}

export function getAnswers(): ApplicationAnswer[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const a = JSON.parse(raw) as ApplicationAnswer[];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
export function saveAnswers(list: ApplicationAnswer[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function ensureSeededAnswers(): void {
  if (localStorage.getItem(SEED_FLAG)) return;
  if (getAnswers().length === 0) {
    saveAnswers(SEED.map((s) => ({ ...s, id: newId(), answer: "", approved: false, lastReviewedAt: null })));
  }
  localStorage.setItem(SEED_FLAG, "1");
}

/** Derive a match pattern from a free-typed question (keyword-ish). */
function patternFromQuestion(q: string): string {
  const words = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !["what", "your", "have", "with", "about", "would", "this", "that", "please", "describe", "tell"].includes(w));
  return words.slice(0, 4).join("|") || q.toLowerCase().slice(0, 20);
}

export function addAnswer(partial?: Partial<ApplicationAnswer>): ApplicationAnswer {
  const a: ApplicationAnswer = {
    id: newId(),
    category: partial?.category ?? "Custom",
    question: partial?.question ?? "",
    answer: partial?.answer ?? "",
    pattern: partial?.pattern ?? (partial?.question ? patternFromQuestion(partial.question) : ""),
    approved: partial?.approved ?? false,
    lastReviewedAt: null,
  };
  saveAnswers([...getAnswers(), a]);
  return a;
}

export function updateAnswer(id: string, patch: Partial<ApplicationAnswer>): void {
  const list = getAnswers();
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return;
  const next = { ...list[i], ...patch };
  if (patch.question && !patch.pattern && !list[i].pattern) next.pattern = patternFromQuestion(patch.question);
  if (patch.approved) next.lastReviewedAt = new Date().toISOString(); // reviewed = you approved it
  list[i] = next;
  saveAnswers(list);
}

export function removeAnswer(id: string): void {
  saveAnswers(getAnswers().filter((a) => a.id !== id));
}

/** Approved answers with actual content — the ones safe to reuse. */
export function getReusableAnswers(): ApplicationAnswer[] {
  return getAnswers().filter((a) => a.approved && a.answer.trim());
}

/** Best reusable answer matching a form question, or null. */
export function matchAnswer(question: string): ApplicationAnswer | null {
  const q = (question || "").toLowerCase();
  if (!q) return null;
  let best: ApplicationAnswer | null = null;
  for (const a of getReusableAnswers()) {
    if (!a.pattern) continue;
    try {
      if (new RegExp(a.pattern, "i").test(q)) {
        if (!best || a.pattern.length > best.pattern.length) best = a; // prefer more specific
      }
    } catch { /* bad regex — skip */ }
  }
  return best;
}
