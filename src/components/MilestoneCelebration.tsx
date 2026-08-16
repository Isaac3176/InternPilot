import { useEffect } from "react";
import type { Status } from "../db/types";

/**
 * A moment of celebration when an application advances to a milestone — like the
 * summary card Strava shows after a run. Bigger and louder the further you get:
 * OA → interview → offer. Rejections get a supportive "onward" variant instead.
 * Each ends with concrete next steps so the momentum turns into action.
 */

type Tier = "mega" | "big" | "mid" | "soft";
interface Milestone {
  emoji: string;
  title: string;
  sub: (company: string) => string;
  next: string[];
  cta: string;
  tier: Tier;
}

const CONTENT: Partial<Record<Status, Milestone>> = {
  oa: {
    emoji: "🎯",
    title: "Online assessment unlocked",
    sub: (c) => `${c} liked your résumé enough to test you. Now show them the code.`,
    next: [
      "Time-box practice: arrays, strings, hashmaps, two-pointers, recursion.",
      "Search this company's OA on LeetCode Discuss & Glassdoor for the format.",
      "Re-read the JD — solve in the language/stack they use.",
    ],
    cta: "Let's prep",
    tier: "mid",
  },
  interview: {
    emoji: "🎤",
    title: "You landed an interview!",
    sub: (c) => `You're in the room at ${c}. This is the part that gets offers.`,
    next: [
      "Write 4–5 STAR stories you can bend to any behavioral question.",
      "Drill the fundamentals + one system-design walkthrough out loud.",
      "Look up your interviewers and prep 2 sharp questions to ask them.",
    ],
    cta: "Start prep",
    tier: "big",
  },
  offer: {
    emoji: "🎉",
    title: "YOU GOT AN OFFER!",
    sub: (c) => `${c} wants you. Take a second — you earned this one.`,
    next: [
      "Get the full offer in writing before you respond to anything.",
      "Check the numbers on levels.fyi — you have more leverage than you think.",
      "It's normal (and expected) to negotiate. Ask for time to decide.",
    ],
    cta: "🥳 Let's go",
    tier: "mega",
  },
  rejected: {
    emoji: "💪",
    title: "Onward.",
    sub: (c) => `${c} wasn't it. Every no clears the path to the yes.`,
    next: [
      "Reply once, kindly, and ask for any feedback — some recruiters share it.",
      "Keep the door open: connect on LinkedIn for the next cycle.",
      "Your other applications are still live. Back to the queue.",
    ],
    cta: "Keep going",
    tier: "soft",
  },
};

/** Which status changes are worth celebrating. */
export function isMilestone(status: Status): boolean {
  return status in CONTENT;
}

function Confetti({ count }: { count: number }) {
  const colors = ["#6d5efc", "#15803d", "#f59e0b", "#e11d48", "#0ea5e9", "#a855f7"];
  return (
    <div className="mc-confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 97 + 13) % 100;
        const delay = (i % 10) * 0.18;
        const dur = 2.4 + (i % 5) * 0.4;
        const rot = (i * 53) % 360;
        return (
          <span
            key={i}
            style={{
              left: `${left}%`,
              background: colors[i % colors.length],
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
              transform: `rotate(${rot}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

export default function MilestoneCelebration({
  status, company, role, onClose, onDetails,
}: {
  status: Status;
  company: string;
  role: string;
  onClose: () => void;
  onDetails?: () => void;
}) {
  const m = CONTENT[status];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!m) return null;

  return (
    <div className="mc-overlay" onClick={onClose}>
      <div className={`mc-card mc-${m.tier}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={m.title}>
        {(m.tier === "mega" || m.tier === "big") && <Confetti count={m.tier === "mega" ? 40 : 24} />}
        <div className="mc-body">
          <div className="mc-emoji">{m.emoji}</div>
          <h2 className="mc-title">{m.title}</h2>
          <p className="mc-co">{company}{role ? ` · ${role}` : ""}</p>
          <p className="mc-sub">{m.sub(company)}</p>

          <div className="mc-next">
            <span className="lbl">{status === "rejected" ? "Keep going" : "Next up"}</span>
            <ul>{m.next.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>

          <div className="mc-actions">
            {onDetails && status !== "rejected" && (
              <button type="button" className="btn" onClick={onDetails}>Add details</button>
            )}
            <button type="button" className="btn primary" onClick={onClose}>{m.cta}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
