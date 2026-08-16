/**
 * OA diagnostics. Turns a set of assessment debriefs into a read on what's
 * actually costing you — time management, recurring weak topics — and a concrete
 * training prescription. Honest by design: it flags patterns and prescribes
 * practice, it does not claim a single OA proves anything. Sample size is surfaced.
 */
import type { OAAttempt, OAQuestion } from "../db/oaAttempts";

export interface OAWeakness { key: string; label: string; detail: string }
export interface OADiagnostics {
  attempts: number;
  totalQuestions: number;
  attempted: number;
  solved: number;
  solveRate: number;        // solved / attempted (0..1)
  completionRate: number;   // attempted / total (0..1)
  worstTimeSinkPct: number | null; // max share of one OA spent on a single unsolved problem
  weaknesses: OAWeakness[];
  weakTopics: { topic: string; count: number }[];
  recommendations: string[];
  lowConfidence: boolean;
}

const TIME_SINK_THRESHOLD = 0.4; // ≥40% of the clock on one unsolved problem → time-management flag

/** Merge topic synonyms so "state transitions", "state machine", "simulation" count together. */
function canonicalTopic(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  if (/simulat|state.?transition|state.?machine/.test(t)) return "Simulation / state machines";
  if (/implementation|ad.?hoc|constructive/.test(t)) return "Implementation-heavy";
  if (/\bmap\b|\bset\b|hash/.test(t)) return "Maps & sets";
  if (/graph|bfs|dfs/.test(t)) return "Graphs";
  if (/dynamic programming|\bdp\b/.test(t)) return "Dynamic programming";
  if (/greedy/.test(t)) return "Greedy";
  if (/tree|binary search tree|\bbst\b/.test(t)) return "Trees";
  if (/two.?pointer|sliding.?window/.test(t)) return "Two pointers / sliding window";
  if (/string/.test(t)) return "Strings";
  if (/array/.test(t)) return "Arrays";
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

const timeSinkOf = (a: OAAttempt): number | null => {
  if (!a.duration_min) return null;
  const unsolvedTimes = a.questions.filter((q: OAQuestion) => q.attempted && !q.solved && q.timeMin != null).map((q) => q.timeMin as number);
  if (unsolvedTimes.length === 0) return null;
  return Math.max(...unsolvedTimes) / a.duration_min;
};

export function analyzeOA(attempts: OAAttempt[]): OADiagnostics | null {
  if (attempts.length === 0) return null;

  const allQ = attempts.flatMap((a) => a.questions);
  const totalQuestions = allQ.length;
  const attempted = allQ.filter((q) => q.attempted).length;
  const solved = allQ.filter((q) => q.solved).length;
  const solveRate = attempted ? solved / attempted : 0;
  const completionRate = totalQuestions ? attempted / totalQuestions : 0;

  const sinks = attempts.map(timeSinkOf).filter((x): x is number => x != null);
  const worstTimeSinkPct = sinks.length ? Math.max(...sinks) : null;

  // Weak topics: unsolved questions' topics + anything the user flagged to review.
  const topicCount = new Map<string, number>();
  const bump = (raw: string | null | undefined) => {
    const c = raw ? canonicalTopic(raw) : "";
    if (c) topicCount.set(c, (topicCount.get(c) ?? 0) + 1);
  };
  for (const a of attempts) {
    for (const q of a.questions) if (q.attempted && !q.solved) bump(q.topic);
    for (const t of a.topics_review) bump(t);
  }
  const weakTopics = [...topicCount.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count);

  const weaknesses: OAWeakness[] = [];
  const timeManagement = worstTimeSinkPct != null && worstTimeSinkPct >= TIME_SINK_THRESHOLD;
  if (timeManagement) {
    weaknesses.push({
      key: "time-management",
      label: "Time management",
      detail: `Your ${attempts.length > 1 ? "worst" : "previous"} assessment spent ${Math.round(worstTimeSinkPct! * 100)}% of available time on one unsolved problem.`,
    });
  }
  if (completionRate < 0.6 && attempted >= 2) {
    weaknesses.push({
      key: "coverage",
      label: "Question coverage",
      detail: `You've attempted ${Math.round(completionRate * 100)}% of the questions across your assessments — some go untouched before time runs out.`,
    });
  }
  for (const wt of weakTopics.slice(0, 3)) {
    weaknesses.push({ key: `topic:${wt.topic}`, label: wt.topic, detail: `Came up in ${wt.count} unsolved / flagged question${wt.count === 1 ? "" : "s"}.` });
  }

  // Prescription.
  const recommendations: string[] = [];
  if (timeManagement || completionRate < 0.6) {
    recommendations.push("2 × four-question timed assessments (full clock — practice moving on)");
    recommendations.push("Set a hard rule: move on after 15 min without meaningful progress");
  }
  const namedTopics = new Set<string>();
  for (const wt of weakTopics.slice(0, 3)) {
    if (wt.topic === "Simulation / state machines") recommendations.push("5 simulation / state-machine problems");
    else if (wt.topic === "Implementation-heavy") recommendations.push("5 implementation-heavy problems");
    else recommendations.push(`5 ${wt.topic.toLowerCase()} problems`);
    namedTopics.add(wt.topic);
  }
  if (recommendations.length === 0) recommendations.push("Keep logging OAs — a couple more and clear patterns will surface.");

  return {
    attempts: attempts.length,
    totalQuestions, attempted, solved, solveRate, completionRate,
    worstTimeSinkPct, weaknesses, weakTopics, recommendations,
    lowConfidence: attempts.length < 3,
  };
}
