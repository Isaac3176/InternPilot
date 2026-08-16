import { getDb, blankToNull, numOrNull } from "./index";
import { cloudMode, supabase } from "../cloud/supabase";

/** One question within an OA debrief. */
export interface OAQuestion {
  attempted: boolean;
  solved: boolean;
  timeMin: number | null;
  difficulty: string | null;
  topic: string | null;
  testsPassed: string | null;
  problem: string | null;
  failureReason: string | null;
}

export interface OAAttempt {
  id: number;
  application_id: number | null;
  company: string | null;
  role_title: string | null;
  taken_on: string | null;
  duration_min: number | null;
  num_questions: number | null;
  questions: OAQuestion[];
  primary_lesson: string | null;
  next_rule: string | null;
  topics_review: string[];
  created_at: string;
}

export interface OAAttemptInput {
  application_id?: number | null;
  company?: string | null;
  role_title?: string | null;
  taken_on?: string | null;
  duration_min?: number | null;
  questions: OAQuestion[];
  primary_lesson?: string | null;
  next_rule?: string | null;
  topics_review?: string[];
}

const asArr = <T>(v: unknown, fallback: T[]): T[] =>
  Array.isArray(v) ? (v as T[]) : typeof v === "string" ? safeParse(v, fallback) : fallback;
function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function normalize(row: Record<string, unknown>): OAAttempt {
  return {
    id: row.id as number,
    application_id: (row.application_id as number) ?? null,
    company: (row.company as string) ?? null,
    role_title: (row.role_title as string) ?? null,
    taken_on: (row.taken_on as string) ?? null,
    duration_min: (row.duration_min as number) ?? null,
    num_questions: (row.num_questions as number) ?? null,
    questions: asArr<OAQuestion>(row.questions, []),
    primary_lesson: (row.primary_lesson as string) ?? null,
    next_rule: (row.next_rule as string) ?? null,
    topics_review: asArr<string>(row.topics_review, []),
    created_at: (row.created_at as string) ?? "",
  };
}

export async function listOAAttempts(): Promise<OAAttempt[]> {
  if (cloudMode()) {
    const { data } = await supabase.from("oa_attempts").select("*").order("taken_on", { ascending: false });
    return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
  }
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>("SELECT * FROM oa_attempts ORDER BY COALESCE(taken_on, created_at) DESC, id DESC");
  return rows.map(normalize);
}

export async function createOAAttempt(input: OAAttemptInput): Promise<number | null> {
  const questions = input.questions ?? [];
  const numQ = questions.length;
  const topics = input.topics_review ?? [];
  if (cloudMode()) {
    const { data, error } = await supabase.from("oa_attempts").insert({
      application_id: input.application_id ?? null, company: blankToNull(input.company),
      role_title: blankToNull(input.role_title), taken_on: blankToNull(input.taken_on),
      duration_min: numOrNull(input.duration_min), num_questions: numQ,
      questions, primary_lesson: blankToNull(input.primary_lesson),
      next_rule: blankToNull(input.next_rule), topics_review: topics,
    }).select("id").single();
    if (error) throw error;
    return (data?.id as number) ?? null;
  }
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO oa_attempts
       (application_id, company, role_title, taken_on, duration_min, num_questions, questions, primary_lesson, next_rule, topics_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.application_id ?? null, blankToNull(input.company), blankToNull(input.role_title),
      blankToNull(input.taken_on), numOrNull(input.duration_min), numQ,
      JSON.stringify(questions), blankToNull(input.primary_lesson), blankToNull(input.next_rule), JSON.stringify(topics)],
  );
  return res.lastInsertId ?? null;
}

export async function deleteOAAttempt(id: number): Promise<void> {
  if (cloudMode()) {
    const { error } = await supabase.from("oa_attempts").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM oa_attempts WHERE id = ?", [id]);
}
