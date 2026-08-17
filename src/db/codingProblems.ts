import { getDb, blankToNull, numOrNull } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";
import type { Difficulty, FailureReason, Pattern, ProblemResult, SolutionQuality } from "../prep/patterns";

export interface CodingProblem {
  id: number;
  name: string;
  url: string | null;
  difficulty: Difficulty | null;
  patterns: Pattern[];
  result: ProblemResult | null;
  time_minutes: number | null;
  hints_used: number | null;
  solution_quality: SolutionQuality | null;
  confidence: number | null;
  failure_reasons: FailureReason[];
  source: string | null;
  solved_at: string | null;
  next_review_at: string | null;
  review_stage: number | null;
  created_at: string;
}

export interface CodingProblemInput {
  name: string;
  url?: string | null;
  difficulty?: Difficulty | null;
  patterns: Pattern[];
  result?: ProblemResult | null;
  time_minutes?: number | null;
  hints_used?: number | null;
  solution_quality?: SolutionQuality | null;
  confidence?: number | null;
  failure_reasons?: FailureReason[];
  source?: string | null;
  solved_at?: string | null;
  next_review_at?: string | null;
  review_stage?: number | null;
}

const asArr = <T>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};

function normalize(row: Record<string, unknown>): CodingProblem {
  return {
    id: row.id as number,
    name: (row.name as string) ?? "",
    url: (row.url as string) ?? null,
    difficulty: (row.difficulty as Difficulty) ?? null,
    patterns: asArr<Pattern>(row.patterns),
    result: (row.result as ProblemResult) ?? null,
    time_minutes: (row.time_minutes as number) ?? null,
    hints_used: (row.hints_used as number) ?? null,
    solution_quality: (row.solution_quality as SolutionQuality) ?? null,
    confidence: (row.confidence as number) ?? null,
    failure_reasons: asArr<FailureReason>(row.failure_reasons),
    source: (row.source as string) ?? null,
    solved_at: (row.solved_at as string) ?? null,
    next_review_at: (row.next_review_at as string) ?? null,
    review_stage: (row.review_stage as number) ?? null,
    created_at: (row.created_at as string) ?? "",
  };
}

export async function listCodingProblems(): Promise<CodingProblem[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("coding_problems").select("*").order("solved_at", { ascending: false });
    return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
  }
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>("SELECT * FROM coding_problems ORDER BY COALESCE(solved_at, created_at) DESC, id DESC");
  return rows.map(normalize);
}

export async function createCodingProblem(input: CodingProblemInput): Promise<number | null> {
  const rec = {
    name: input.name, url: blankToNull(input.url), difficulty: input.difficulty ?? null,
    patterns: input.patterns ?? [], result: input.result ?? null, time_minutes: numOrNull(input.time_minutes),
    hints_used: numOrNull(input.hints_used), solution_quality: input.solution_quality ?? null,
    confidence: numOrNull(input.confidence), failure_reasons: input.failure_reasons ?? [],
    source: input.source ?? "manual", solved_at: input.solved_at ?? new Date().toISOString(),
    next_review_at: input.next_review_at ?? null, review_stage: input.review_stage ?? null,
  };
  if (cloudMode()) {
    const { data, error } = await supabase.from("coding_problems").insert(rec).select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO coding_problems
       (name, url, difficulty, patterns, result, time_minutes, hints_used, solution_quality, confidence, failure_reasons, source, solved_at, next_review_at, review_stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [rec.name, rec.url, rec.difficulty, JSON.stringify(rec.patterns), rec.result, rec.time_minutes, rec.hints_used,
      rec.solution_quality, rec.confidence, JSON.stringify(rec.failure_reasons), rec.source, rec.solved_at, rec.next_review_at, rec.review_stage],
  );
  return res.lastInsertId ?? null;
}

/** After a re-solve, update the result + spaced-repetition schedule. */
export async function updateCodingReview(id: number, patch: { result: ProblemResult; confidence: number | null; next_review_at: string | null; review_stage: number | null; solved_at: string }): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("coding_problems").update(patch).eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE coding_problems SET result = ?, confidence = ?, next_review_at = ?, review_stage = ?, solved_at = ? WHERE id = ?",
    [patch.result, patch.confidence, patch.next_review_at, patch.review_stage, patch.solved_at, id],
  );
}

export async function deleteCodingProblem(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("coding_problems").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM coding_problems WHERE id = ?", [id]);
}
