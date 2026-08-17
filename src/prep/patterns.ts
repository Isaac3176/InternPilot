/**
 * The vocabulary of the Prep Engine: the ~15 interview patterns we score
 * readiness against, the quick-select failure reasons, and a mapper from free-text
 * OA topics onto those patterns so assessments feed the same readiness scores as
 * logged practice problems.
 */

export const PATTERNS = [
  "Arrays & Hashing",
  "Two Pointers",
  "Sliding Window",
  "Stack",
  "Binary Search",
  "Linked Lists",
  "Trees",
  "Heaps / Priority Queue",
  "Backtracking",
  "Graphs",
  "Dynamic Programming",
  "Greedy",
  "Intervals",
  "Simulation / Implementation",
  "Union Find",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const RESULTS = ["solved", "partial", "failed"] as const;
export type ProblemResult = (typeof RESULTS)[number];

export const SOLUTION_QUALITIES = ["optimal", "working", "incorrect"] as const;
export type SolutionQuality = (typeof SOLUTION_QUALITIES)[number];

/** Why the problem was hard — arguably more useful than the result itself. */
export const FAILURE_REASONS = [
  "Pattern recognition",
  "Didn't know algorithm",
  "Implementation bug",
  "Edge cases",
  "Too slow",
  "Time management",
  "Misread problem",
  "Complexity",
  "Got stuck / didn't move on",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

/** Rough "solved it in time" target minutes by difficulty. */
export const TARGET_MIN: Record<Difficulty, number> = { easy: 15, medium: 30, hard: 45 };

/** Map an OA question's free-text topic onto a Prep Engine pattern (best-effort). */
export function topicToPattern(raw: string | null | undefined): Pattern | null {
  const t = (raw ?? "").toLowerCase();
  if (!t) return null;
  if (/simulat|state.?transition|state.?machine|implementation|ad.?hoc/.test(t)) return "Simulation / Implementation";
  if (/union.?find|disjoint/.test(t)) return "Union Find";
  if (/graph|bfs|dfs|topolog/.test(t)) return "Graphs";
  if (/dynamic programming|\bdp\b|memoi/.test(t)) return "Dynamic Programming";
  if (/greedy/.test(t)) return "Greedy";
  if (/interval|merge.?interval|sweep/.test(t)) return "Intervals";
  if (/backtrack|permutation|combination|subset/.test(t)) return "Backtracking";
  if (/heap|priority.?queue|\bpq\b/.test(t)) return "Heaps / Priority Queue";
  if (/tree|\bbst\b|binary tree/.test(t)) return "Trees";
  if (/linked.?list/.test(t)) return "Linked Lists";
  if (/binary.?search/.test(t)) return "Binary Search";
  if (/stack|monoton|paren/.test(t)) return "Stack";
  if (/sliding.?window/.test(t)) return "Sliding Window";
  if (/two.?pointer/.test(t)) return "Two Pointers";
  if (/array|hash|\bmap\b|\bset\b|string|prefix.?sum|counting/.test(t)) return "Arrays & Hashing";
  return null;
}
