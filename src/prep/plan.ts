/**
 * Company OA prep plan. Given a scheduled OA (from Interview Prep) and your current
 * Prep Engine readiness, lay out a countdown study plan targeting your weakest
 * patterns: practice days front-loaded, a timed OA simulation mid-plan, and a light
 * taper before the date. This is what ties the Prep Engine to a real deadline.
 */
import type { PatternReadiness, PrepOverview } from "./engine";
import type { Pattern } from "./patterns";

const DAY = 86_400_000;
const CORE_FALLBACK: Pattern[] = ["Simulation / Implementation", "Graphs", "Dynamic Programming"];

export interface PlanDay { label: string; date: string; tasks: string[]; sim: boolean }
export interface OAPlan {
  company: string;
  role: string | null;
  dueLabel: string;
  daysUntil: number;
  readiness: number;
  relevantWeak: PatternReadiness[];
  days: PlanDay[];
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export function buildOAPlan(company: string, role: string | null, dueDateStr: string, ov: PrepOverview, now = Date.now()): OAPlan | null {
  const due = Date.parse(dueDateStr);
  if (Number.isNaN(due)) return null;
  const daysUntil = Math.ceil((due - now) / DAY);
  if (daysUntil < 0) return null;

  const weak = ov.needsWork.slice(0, 4);
  const weakPats: Pattern[] = weak.length ? weak.map((w) => w.pattern) : CORE_FALLBACK;

  const simIdx = daysUntil >= 3 ? Math.max(1, Math.floor(daysUntil / 2)) : -1;
  const days: PlanDay[] = [];
  let cursor = 0;
  for (let i = 0; i <= daysUntil; i++) {
    const dateMs = now + i * DAY;
    const label = i === 0 ? "Today" : i === daysUntil ? "OA day" : fmtDate(dateMs);
    let tasks: string[] = [];
    let sim = false;
    if (i === daysUntil) {
      tasks = ["Take the OA — open every question first, move on after 15 min stuck"];
    } else if (i === daysUntil - 1 && daysUntil >= 2) {
      tasks = ["Light review: 2 quick re-solves of past problems", "Rest — no new hard problems, don't cram"];
    } else if (i === simIdx) {
      tasks = ["75-min OA simulation (4 questions) — practice seeing all four"];
      sim = true;
    } else {
      const a = weakPats[cursor++ % weakPats.length];
      const b = weakPats[cursor++ % weakPats.length];
      tasks = a === b ? [`3 × ${a} medium`] : [`2 × ${a} medium`, `1 × ${b} medium`];
    }
    days.push({ label, date: fmtDate(dateMs), tasks, sim });
  }

  return { company, role, dueLabel: fmtDate(due), daysUntil, readiness: ov.overall, relevantWeak: weak, days };
}
