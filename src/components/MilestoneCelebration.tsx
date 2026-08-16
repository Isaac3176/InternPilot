import { useEffect } from "react";
import type { Status } from "../db/types";

/**
 * A "finish screen" when an application advances to a milestone — like Strava's
 * post-run summary. It scales with the win (OA → interview → offer) and always
 * ends in a concrete next action, because the point of the screen is to start the
 * next thing, not just to congratulate you. Rejection gets a neutral, honest
 * variant instead of confetti — celebrating it would be insulting, ignoring it
 * wastes the one moment you're actually thinking about the search.
 */

type Tier = "oa" | "interview" | "offer" | "rejected";
interface Step { ic: "a" | "b" | "c" | "d" | "n"; emoji: string; t: string; s: string }
interface Content {
  glyph: string;
  eyebrow: string;
  title: (c: string) => string;
  sub: string;
  h3: string;
  steps: Step[];
  wisdom: string;
  wc: string;
  cta: string;
  alt: string;
  confetti?: boolean;
}

const CONTENT: Record<Tier, Content> = {
  oa: {
    glyph: "🎯", eyebrow: "Assessment unlocked",
    title: (c) => `${c} sent you an OA`,
    sub: "You cleared the résumé screen — the filter most applications die at.",
    h3: "Do these before you open it",
    steps: [
      { ic: "b", emoji: "⏰", t: "Block 90 minutes this week", s: "Most OAs expire in 5–7 days. Schedule it, don't improvise." },
      { ic: "a", emoji: "💻", t: "Warm up on their format", s: "Two timed problems at the difficulty this company usually asks." },
      { ic: "n", emoji: "📄", t: "Reread the JD you applied with", s: "OA topics track the posting more often than people expect." },
    ],
    wisdom: "An OA isn't an exam you cram for the night before — it's a rehearsal you've either been doing all along or you haven't. The work from the two weeks before this email is what shows up.",
    wc: "var(--violet)", cta: "Prep now", alt: "Later",
  },
  interview: {
    glyph: "🎤", eyebrow: "Interview scheduled",
    title: (c) => `You're interviewing at ${c}`,
    sub: "Out of everyone who applied to this posting, you're in the room.",
    h3: "Before the interview",
    steps: [
      { ic: "d", emoji: "🗣️", t: "Pick one project to go deep on", s: "You'll be asked to walk through something. Choose it now." },
      { ic: "a", emoji: "🔍", t: "Read past-candidate write-ups", s: "Check what this company's loop has looked like before." },
      { ic: "c", emoji: "👥", t: "Prepare two questions for them", s: "Not about the role — about what the team is actually building." },
    ],
    wisdom: "Interviewers aren't checking whether you know the answer. They're checking what you do in the ninety seconds where you don't. Practice thinking out loud, not just solving.",
    wc: "var(--warn)", cta: "Line up an insider", alt: "Later",
  },
  offer: {
    glyph: "🎉", eyebrow: "Offer",
    title: (c) => `${c} made you an offer`,
    sub: "Take a second — you earned this one before you turn it into a decision.",
    h3: "Before you answer",
    steps: [
      { ic: "c", emoji: "📄", t: "Read the whole offer, twice", s: "Pay, dates, return-offer terms, and the deadline to respond." },
      { ic: "a", emoji: "⏳", t: "Ask for time if you need it", s: "Two weeks is normal to request. Asking is not a red flag." },
      { ic: "d", emoji: "📣", t: "Tell your live applications", s: "Companies mid-process can move faster when there's a deadline." },
    ],
    wisdom: "Feel good about this before you turn it into a decision. You earned the right to have a choice — the choosing can wait until tomorrow.",
    wc: "var(--good)", cta: "Log the details", alt: "Close", confetti: true,
  },
  rejected: {
    glyph: "↺", eyebrow: "Closed out",
    title: (c) => `${c} passed`,
    sub: "Logged. Nothing about this one needs your attention right now.",
    h3: "Worth doing while it's fresh",
    steps: [
      { ic: "n", emoji: "📝", t: "Note what stage it ended at", s: "A résumé screen and a final round are different problems." },
      { ic: "a", emoji: "🔎", t: "Find similar roles", s: "Same stack, same season — you already have the tailored résumé." },
      { ic: "n", emoji: "🌙", t: "Nothing else tonight", s: "One rejection isn't a signal. Don't rewrite your résumé over it." },
    ],
    wisdom: "A handful of applications is too few to learn anything from a single rejection — you'd need dozens at the same stage before a pattern means more than luck. Until then, the only correct response is to send the next one.",
    wc: "var(--muted)", cta: "Find similar roles", alt: "Close",
  },
};

/** Which status changes get a finish screen. */
export function isMilestone(status: Status): status is Tier {
  return status === "oa" || status === "interview" || status === "offer" || status === "rejected";
}

const CONFETTI_COLORS = ["#f3b24e", "#5fd3a5", "#7fb0f7", "#f08a7a", "#ffffff"];

export default function MilestoneCelebration({
  status, company, role, stats, onClose, onPrimary,
}: {
  status: Tier;
  company: string;
  role: string;
  stats: [string, string][];
  onClose: () => void;
  onPrimary: () => void;
}) {
  const m = CONTENT[status];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="ms-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ms-modal" role="dialog" aria-modal="true" aria-label={m.title(company)}>
        <div className={`ms-hero ${status}`}>
          {m.confetti && (
            <div className="ms-confetti" aria-hidden>
              {Array.from({ length: 26 }, (_, i) => (
                <i key={i} style={{
                  left: `${(i * 37 + 5) % 100}%`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  animationDelay: `${((i % 9) * 0.1).toFixed(2)}s`,
                }} />
              ))}
            </div>
          )}
          <div className="ms-ring">{m.glyph}</div>
          <span className="eyebrow">{m.eyebrow}</span>
          <h2>{m.title(company)}</h2>
          <p>{role || m.sub}</p>
        </div>

        <div className="ms-stats">
          {stats.map(([b, s], i) => (
            <div className="ms-stat" key={i}><b>{b}</b><span>{s}</span></div>
          ))}
        </div>

        <div className="ms-body">
          <h3>{m.h3}</h3>
          <ul className="ms-steps">
            {m.steps.map((s, i) => (
              <li key={i}>
                <span className={`ic ${s.ic}`}>{s.emoji}</span>
                <span className="tx"><b>{s.t}</b><span>{s.s}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ms-wisdom" style={{ "--c": m.wc } as React.CSSProperties}>
          <span className="eyebrow">Worth remembering</span>
          <p>{m.wisdom}</p>
        </div>

        <div className="ms-foot">
          <button type="button" className="btn" onClick={onClose}>{m.alt}</button>
          <button type="button" className="btn primary" onClick={onPrimary}>{m.cta}</button>
        </div>
      </div>
    </div>
  );
}
