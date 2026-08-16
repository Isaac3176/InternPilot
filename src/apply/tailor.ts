/**
 * Bullet-level tailoring for a specific posting. Given the JD and your bullet
 * library, rank which of YOUR bullets best match this job (lead with these) and
 * which JD skills no bullet covers (the gaps to weave in). Fully deterministic and
 * offline — it reuses jdSkillMatch, so "this bullet hits React, TypeScript, REST"
 * is honest keyword coverage, not a guess.
 */
import { jdSkillMatch } from "../listings/match";
import type { ResumeBullet } from "../db/types";

export interface BulletMatch {
  id: number;
  text: string;
  experience: string | null;
  skills: string[]; // JD skills this bullet covers
}

export interface TailorResult {
  leadWith: BulletMatch[]; // your bullets that hit >=1 JD skill, strongest first
  covered: string[]; // JD skills your bullets cover
  gaps: string[]; // JD skills no bullet covers
  jdSkillCount: number; // distinct JD skills detected
}

/** Rank the bullet library against a job description. */
export function tailorForJob(jd: string, bullets: ResumeBullet[]): TailorResult {
  // jdSkillMatch(jd, "") → matched is empty, so `missing` is every JD skill detected.
  const allSkills = jdSkillMatch(jd, "").missing;
  if (allSkills.length === 0) return { leadWith: [], covered: [], gaps: [], jdSkillCount: 0 };

  const covered = new Set<string>();
  const matches: BulletMatch[] = [];
  for (const b of bullets) {
    const text = (b.improved_text ?? b.original_text ?? "").trim();
    if (!text) continue;
    const skills = jdSkillMatch(jd, text).matched;
    if (skills.length === 0) continue;
    skills.forEach((s) => covered.add(s));
    matches.push({ id: b.id, text, experience: b.experience_name, skills });
  }
  // Strongest first (most JD skills), tie-break shorter bullet (punchier to lead with).
  matches.sort((a, b) => b.skills.length - a.skills.length || a.text.length - b.text.length);

  const gaps = allSkills.filter((s) => !covered.has(s));
  return { leadWith: matches.slice(0, 6), covered: [...covered], gaps, jdSkillCount: allSkills.length };
}
