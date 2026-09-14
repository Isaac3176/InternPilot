/** Match-score tier shared by desktop and mobile so the cutoffs can't drift apart. */
export type ScoreTier = "good" | "accent" | "warn";

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return "good";
  if (score >= 65) return "accent";
  return "warn";
}
