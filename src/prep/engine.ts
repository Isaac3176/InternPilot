/**
 * The Prep Engine. Answers one question: "what should I practice today, based on
 * where I'm actually failing?" Readiness is scored per pattern (not problems-solved)
 * from a weighted blend of independent-solve rate, timed performance, retention,
 * difficulty, and recency — and OA attempts feed the exact same scores, so a
 * simulation you failed on a real assessment counts against that pattern too.
 */
import { PATTERNS, TARGET_MIN, topicToPattern, type Difficulty, type Pattern, type ProblemResult } from "./patterns";
import type { CodingProblem } from "../db/codingProblems";
import type { OAAttempt } from "../db/oaAttempts";

const DAY = 86_400_000;
export const REVIEW_INTERVALS = [1, 3, 7, 30, 90]; // days per spaced-repetition stage

/** Spaced repetition: when to re-solve next, given this attempt's outcome. */
export function scheduleReview(result: ProblemResult, confidence: number | null = 3, prevStage: number | null = null, now = Date.now()): { stage: number; nextReviewAt: string } {
  let stage: number;
  if (result === "failed") stage = 0;
  else if (result === "partial") stage = 1;
  else {
    const base = prevStage == null ? 2 : prevStage + ((confidence ?? 3) >= 4 ? 1 : 0);
    stage = Math.min(base, REVIEW_INTERVALS.length - 1);
  }
  return { stage, nextReviewAt: new Date(now + REVIEW_INTERVALS[stage] * DAY).toISOString() };
}

interface Sample {
  patterns: Pattern[];
  difficulty: Difficulty;
  solved: boolean;
  independent: boolean;
  timedOk: boolean;
  confident: boolean;
  when: number;
  failed: boolean;
  reasons: string[];
  time: number | null;
}

const parseTs = (s: string | null | undefined): number => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? 0 : t;
};
const asDiff = (d: string | null | undefined): Difficulty => {
  const s = (d ?? "").toLowerCase();
  return s.startsWith("e") ? "easy" : s.startsWith("h") ? "hard" : "medium";
};

function samplesFrom(problems: CodingProblem[], oas: OAAttempt[]): Sample[] {
  const out: Sample[] = [];
  for (const p of problems) {
    if (!p.patterns?.length) continue;
    const solved = p.result === "solved";
    const diff = asDiff(p.difficulty);
    out.push({
      patterns: p.patterns, difficulty: diff, solved,
      independent: solved && (p.hints_used ?? 0) === 0 && p.solution_quality !== "incorrect",
      timedOk: solved && p.time_minutes != null && p.time_minutes <= TARGET_MIN[diff],
      confident: solved && (p.confidence ?? 0) >= 4,
      when: parseTs(p.solved_at ?? p.created_at),
      failed: p.result !== "solved",
      reasons: p.failure_reasons ?? [],
      time: p.time_minutes ?? null,
    });
  }
  for (const a of oas) {
    const when = parseTs(a.taken_on ?? a.created_at);
    for (const q of a.questions) {
      if (!q.attempted) continue;
      const pat = topicToPattern(q.topic);
      if (!pat) continue;
      const diff = asDiff(q.difficulty);
      out.push({
        patterns: [pat], difficulty: diff, solved: q.solved,
        independent: q.solved, // OAs have no hints
        timedOk: q.solved && q.timeMin != null && q.timeMin <= TARGET_MIN[diff],
        confident: q.solved,
        when, failed: !q.solved,
        reasons: q.failureReason ? [q.failureReason] : [],
        time: q.timeMin ?? null,
      });
    }
  }
  return out;
}

const DIFF_WEIGHT: Record<Difficulty, number> = { easy: 0.5, medium: 0.8, hard: 1 };
const recencyScore = (lastDays: number | null): number =>
  lastDays == null ? 0.2 : lastDays < 7 ? 1 : lastDays < 21 ? 0.7 : lastDays < 60 ? 0.4 : 0.2;

export interface PatternReadiness {
  pattern: Pattern;
  readiness: number;      // 0-100
  attempted: number;
  independentSolves: number;
  timedSolves: number;
  failed: number;
  avgMediumTime: number | null;
  lastPracticedDays: number | null;
  primaryIssue: string | null;
  practiced: boolean;
}

function scorePattern(pattern: Pattern, samples: Sample[], now: number): PatternReadiness {
  const mine = samples.filter((s) => s.patterns.includes(pattern));
  const attempted = mine.length;
  if (attempted === 0) {
    return { pattern, readiness: 0, attempted: 0, independentSolves: 0, timedSolves: 0, failed: 0, avgMediumTime: null, lastPracticedDays: null, primaryIssue: null, practiced: false };
  }
  const independent = mine.filter((s) => s.independent).length;
  const timed = mine.filter((s) => s.timedOk).length;
  const failed = mine.filter((s) => s.failed).length;
  const confidentSolved = mine.filter((s) => s.confident).length;
  const solved = mine.filter((s) => s.solved);
  const diffScore = solved.length ? solved.reduce((a, s) => a + DIFF_WEIGHT[s.difficulty], 0) / solved.length : 0;
  const last = Math.max(...mine.map((s) => s.when));
  const lastDays = last > 0 ? Math.floor((now - last) / DAY) : null;

  const readiness = Math.round(100 * (
    0.35 * (independent / attempted) +
    0.25 * (timed / attempted) +
    0.20 * (confidentSolved / attempted) +
    0.10 * diffScore +
    0.10 * recencyScore(lastDays)
  ));

  // Primary issue: most common failure reason across failed attempts in this pattern.
  const reasonCount = new Map<string, number>();
  for (const s of mine) if (s.failed) for (const r of s.reasons) reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
  const primaryIssue = [...reasonCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const medTimes = mine.filter((s) => s.difficulty === "medium" && s.solved && s.time != null).map((s) => s.time as number);
  const avgMediumTime = medTimes.length ? Math.round(medTimes.reduce((a, b) => a + b, 0) / medTimes.length) : null;

  return { pattern, readiness, attempted, independentSolves: independent, timedSolves: timed, failed, avgMediumTime, lastPracticedDays: lastDays, primaryIssue, practiced: true };
}

export interface TodayItem {
  kind: "new" | "review" | "quick";
  label: string;
  detail: string;
  minutes: number;
  pattern?: Pattern;
  difficulty?: Difficulty;
  problemId?: number;
}
export interface PrepOverview {
  overall: number;
  patterns: PatternReadiness[]; // all 15, sorted by readiness asc
  needsWork: PatternReadiness[];
  strong: PatternReadiness[];
  today: TodayItem[];
  todayMinutes: number;
  totalAttempts: number;
}

export function buildOverview(problems: CodingProblem[], oas: OAAttempt[], now = Date.now()): PrepOverview {
  const samples = samplesFrom(problems, oas);
  const patterns = PATTERNS.map((p) => scorePattern(p, samples, now)).sort((a, b) => a.readiness - b.readiness);
  const practiced = patterns.filter((p) => p.practiced);

  // Weighted overall — more attempts → more weight, so one lucky solve doesn't inflate.
  let wsum = 0, acc = 0;
  for (const p of practiced) { const w = Math.min(p.attempted, 5) / 5; acc += p.readiness * w; wsum += w; }
  const overall = wsum ? Math.round(acc / wsum) : 0;

  const needsWork = practiced.filter((p) => p.readiness < 70).slice(0, 6);
  const strong = practiced.filter((p) => p.readiness >= 75).sort((a, b) => b.readiness - a.readiness).slice(0, 6);

  // Today: due reviews + new practice targeting the weakest patterns.
  const due = problems.filter((p) => p.next_review_at && parseTs(p.next_review_at) <= now);
  const review: TodayItem[] = due.filter((p) => p.result !== "solved").map((p) => {
    const days = p.solved_at ? Math.max(0, Math.floor((now - parseTs(p.solved_at)) / DAY)) : null;
    return { kind: "review", label: `Re-solve: ${p.name}`, detail: days != null ? `Failed ${days === 0 ? "today" : `${days}d ago`}` : "Due for review", minutes: asDiff(p.difficulty) === "hard" ? 25 : 15, problemId: p.id };
  });
  const quick: TodayItem[] = due.filter((p) => p.result === "solved").map((p) => ({
    kind: "quick", label: `Quick review: ${p.name}`, detail: "Previously solved", minutes: 5, problemId: p.id,
  }));

  // New practice: the 2 weakest patterns (prefer ones with some signal, else core gaps).
  const weakOrder = [...patterns].sort((a, b) => {
    // practiced-but-weak first, then unpracticed core patterns
    if (a.practiced !== b.practiced) return a.practiced ? -1 : 1;
    return a.readiness - b.readiness;
  });
  // Adaptive difficulty: a very weak/unpracticed pattern starts easy to build the
  // shape; a near-ready one gets pushed to hard. Practiced-but-mid stays medium.
  const pick = (r: PatternReadiness): { d: Difficulty; m: number } =>
    !r.practiced || r.readiness < 35 ? { d: "easy", m: 15 } : r.readiness < 65 ? { d: "medium", m: 20 } : { d: "hard", m: 30 };
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const newItems: TodayItem[] = weakOrder.slice(0, 2).map((p) => {
    const { d, m } = pick(p);
    return { kind: "new", label: `${p.pattern} — ${cap(d)}`, detail: p.practiced ? `Readiness ${p.readiness}% · ${d === "easy" ? "rebuild the pattern" : d === "hard" ? "push to stress-test it" : "consolidate"}` : "Not practiced yet — start easy", minutes: m, pattern: p.pattern, difficulty: d };
  });

  const today = [...newItems, ...review, ...quick];
  const todayMinutes = today.reduce((a, t) => a + t.minutes, 0);

  return { overall, patterns, needsWork, strong, today, todayMinutes, totalAttempts: samples.length };
}
