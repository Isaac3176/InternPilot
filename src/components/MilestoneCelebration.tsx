import { useEffect, useState } from "react";

/**
 * Outcome moments — a popup per status change, styled like a Strava finish screen.
 * Each has its own gradient + animated hero art, a journey strip that shows where
 * this outcome sits in the pipeline, three stats from the user's own tracker, next
 * actions, and a dark "Field Note" with a rotating line of perspective (shuffle to
 * cycle). Nothing is congratulatory that shouldn't be: rejection and ghosting get
 * neutral headers and a terminal marker on the journey instead of a checkmark.
 */

export type Kind = "applied" | "oa" | "interview" | "offer" | "rejected" | "ghosted";
export type Terminal = "rejected" | "ghosted" | null;

interface Tone { c: string; soft: string; ink: string }
interface Step { ic: string; t: string; s: string }
interface Note { q: string; src: string }
interface Content {
  eyebrow: string; title: (c: string) => string; sub: string;
  h3: string; steps: Step[]; notes: Note[];
  cta: string; alt: string; confetti?: boolean; tone: Tone;
}

const TONE = {
  applied: { c: "var(--accent)", soft: "var(--accent-soft)", ink: "var(--accent)" },
  oa: { c: "var(--violet)", soft: "var(--violet-soft)", ink: "var(--violet)" },
  interview: { c: "var(--warn)", soft: "var(--warn-soft)", ink: "var(--warn)" },
  offer: { c: "var(--good)", soft: "var(--good-soft)", ink: "var(--good)" },
  rejected: { c: "var(--muted-2)", soft: "var(--line-soft)", ink: "var(--muted)" },
  ghosted: { c: "var(--muted-2)", soft: "var(--line-soft)", ink: "var(--muted)" },
} as const;

const ICON: Record<string, string> = {
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`,
  code: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l-6-6 6-6M15 6l6 6-6 6"/></svg>`,
  doc: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6"/></svg>`,
  chat: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.4 7.2L4 20.5l1.3-5.4A8 8 0 1121 12z"/></svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>`,
  user: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0115 0"/></svg>`,
  list: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`,
  cal: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v3M16 3v3"/><rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17"/></svg>`,
  mail: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>`,
  pen: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`,
};

const ART: Record<Kind, string> = {
  applied: `<svg width="92" height="66" viewBox="0 0 92 66" fill="none"><path class="trail" d="M6 54C22 54 38 44 50 26" stroke="rgba(255,255,255,.42)" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="5 7"/><g class="float"><path d="M82 8 66 52l-7-16-16-7z" fill="#fff"/><path d="M82 8 52 29l7 7z" fill="rgba(255,255,255,.55)"/></g><circle cx="6" cy="54" r="3.2" fill="rgba(255,255,255,.55)"/></svg>`,
  oa: `<svg width="92" height="66" viewBox="0 0 92 66" fill="none"><rect x="12" y="10" width="68" height="46" rx="8" stroke="rgba(255,255,255,.36)" stroke-width="2"/><path d="M12 22h68" stroke="rgba(255,255,255,.22)" stroke-width="2"/><circle cx="20" cy="16" r="1.8" fill="rgba(255,255,255,.5)"/><circle cx="26" cy="16" r="1.8" fill="rgba(255,255,255,.3)"/><path d="M24 34l-5 5 5 5M40 34l5 5-5 5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect class="cursor" x="52" y="32" width="3.4" height="15" rx="1" fill="#B9A5F8"/></svg>`,
  interview: `<svg width="92" height="66" viewBox="0 0 92 66" fill="none"><g class="float"><rect x="10" y="14" width="42" height="30" rx="9" fill="rgba(255,255,255,.9)"/><path d="M20 44l-2 8 11-8z" fill="rgba(255,255,255,.9)"/><circle cx="24" cy="29" r="2.4" fill="#8A5D12"/><circle cx="31" cy="29" r="2.4" fill="#8A5D12"/><circle cx="38" cy="29" r="2.4" fill="#8A5D12"/></g><rect x="48" y="26" width="36" height="26" rx="8" fill="rgba(255,255,255,.28)"/><path d="M76 52l3 7-10-7z" fill="rgba(255,255,255,.28)"/></svg>`,
  offer: `<svg width="92" height="70" viewBox="0 0 92 70" fill="none"><g class="ray" stroke="rgba(255,255,255,.5)" stroke-width="2.4" stroke-linecap="round"><path d="M46 4v9"/><path d="M46 57v9"/><path d="M13 35H4"/><path d="M88 35h-9"/><path d="M22 11l6 6"/><path d="M64 53l6 6"/><path d="M70 11l-6 6"/><path d="M28 53l-6 6"/></g><circle class="pulse" cx="46" cy="35" r="20" fill="rgba(255,255,255,.28)"/><circle cx="46" cy="35" r="19" fill="#fff"/><path d="M38 35.5l6 6 12-13" stroke="#0F8560" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  rejected: `<svg width="110" height="52" viewBox="0 0 110 52" fill="none"><g fill="rgba(255,255,255,.20)">${Array.from({ length: 13 }, (_, i) => `<circle cx="${8 + i * 7.6}" cy="26" r="3"/>`).join("")}</g><circle cx="99" cy="26" r="5.4" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="2"/><path d="M96.6 23.6l4.8 4.8M101.4 23.6l-4.8 4.8" stroke="rgba(255,255,255,.65)" stroke-width="2" stroke-linecap="round"/></svg>`,
  ghosted: `<svg width="100" height="56" viewBox="0 0 100 56" fill="none"><g class="float"><rect x="8" y="12" width="40" height="28" rx="9" fill="rgba(255,255,255,.88)"/><path d="M17 40l-2 8 11-8z" fill="rgba(255,255,255,.88)"/><path d="M18 22h20M18 30h12" stroke="#3A4658" stroke-width="2.4" stroke-linecap="round"/></g><circle class="fade1" cx="66" cy="28" r="3.4" fill="rgba(255,255,255,.5)"/><circle class="fade2" cx="78" cy="28" r="3.4" fill="rgba(255,255,255,.32)"/><circle cx="90" cy="28" r="3.4" fill="rgba(255,255,255,.12)"/></svg>`,
};

const STAGE_LABELS = ["Saved", "Applied", "OA", "Interview", "Offer"];
const TICK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

const CONTENT: Record<Kind, Content> = {
  applied: {
    eyebrow: "Application in", title: (c) => `Sent to ${c}`,
    sub: "Now do the part almost nobody does: start preparing today, not when they reply.",
    h3: "Start the clock",
    steps: [
      { ic: "doc", t: "Build the prep list for this stack", s: "Pulled from the JD you just applied with." },
      { ic: "user", t: "Find one engineer on this team", s: "Not a referral ask — a question about what they're building." },
      { ic: "cal", t: "Set a follow-up reminder", s: "Silence past your usual reply window means something." },
    ],
    notes: [
      { q: "The application is the cheap part. The expensive part is being ready when they answer — and that work has to start before you know whether they will.", src: "InternPilot · field note" },
      { q: "You will send far more applications than you get replies. Build the habit so that sending one costs you almost nothing.", src: "InternPilot · field note" },
      { q: "Speed is one of the few variables in this process you fully control. Applying early beats applying polished, most of the time.", src: "InternPilot · field note" },
    ],
    cta: "Build the prep list", alt: "Later", tone: TONE.applied,
  },
  oa: {
    eyebrow: "Assessment unlocked", title: (c) => `${c} sent an OA`,
    sub: "You cleared the résumé screen — the filter most applications die at.",
    h3: "Before you open it",
    steps: [
      { ic: "clock", t: "Block 90 minutes this week", s: "Most OAs expire in 5–7 days. Schedule it, don't improvise." },
      { ic: "code", t: "Two timed problems tonight", s: "At the difficulty this company usually asks — timed, not casual." },
      { ic: "doc", t: "Reread the JD you applied with", s: "OA topics track the posting more often than people expect." },
    ],
    notes: [
      { q: "An OA isn't an exam you cram for the night before. It's a rehearsal you've either been doing all along or you haven't.", src: "InternPilot · field note" },
      { q: "Read the whole problem before writing anything. Most failed assessments are correct solutions to a slightly different question.", src: "InternPilot · field note" },
      { q: "Getting an OA means your résumé worked. Whatever version you sent, that one is now evidence — not a guess.", src: "From your own tracker" },
    ],
    cta: "Prep now", alt: "Later", tone: TONE.oa,
  },
  interview: {
    eyebrow: "Interview scheduled", title: (c) => `You're interviewing at ${c}`,
    sub: "Of everyone who applied to this posting, you're one of the few in the room.",
    h3: "Before the interview",
    steps: [
      { ic: "chat", t: "Pick one project to go deep on", s: "You'll be asked to walk through something. Choose it now, not there." },
      { ic: "search", t: "Read what past candidates reported", s: "Check what this company's loop has looked like before." },
      { ic: "user", t: "Write two questions for them", s: "Not about the role — about what the team is actually building." },
    ],
    notes: [
      { q: "Interviewers aren't checking whether you know the answer. They're watching what you do in the ninety seconds where you don't.", src: "InternPilot · field note" },
      { q: "Say what you're considering before you commit to it. A wrong approach narrated well beats a right one produced silently.", src: "InternPilot · field note" },
      { q: "You've been asked to explain your own work. That's the one topic where you're the expert in the room — use it.", src: "InternPilot · field note" },
    ],
    cta: "Line up an insider", alt: "Later", tone: TONE.interview,
  },
  offer: {
    eyebrow: "Offer", title: (c) => `${c} made you an offer`,
    sub: "Take a second — you earned this one before you turn it into a decision.",
    h3: "Before you answer",
    steps: [
      { ic: "doc", t: "Read the whole thing, twice", s: "Dates, pay, return-offer terms, and the response deadline." },
      { ic: "clock", t: "Ask for time if you need it", s: "Two weeks is a normal request. Asking is not a red flag." },
      { ic: "list", t: "Tell your live applications", s: "A real deadline moves processes that were sitting still." },
    ],
    notes: [
      { q: "Take a day to feel good about this before you turn it into a decision. You earned a choice; the choosing can wait until tomorrow.", src: "InternPilot · field note" },
      { q: "Every rejection before this one was priced into getting here. The no's bought the yes, and that was always the trade.", src: "From your own tracker" },
      { q: "The offer is information about fit at one company on one day. It is not a verdict on you — the same way the rejections weren't.", src: "InternPilot · field note" },
    ],
    cta: "Log the details", alt: "Close", confetti: true, tone: TONE.offer,
  },
  rejected: {
    eyebrow: "Closed out", title: (c) => `${c} passed`,
    sub: "Logged. Nothing here needs your attention tonight.",
    h3: "Worth doing while it's fresh",
    steps: [
      { ic: "pen", t: "Note the stage it ended at", s: "A résumé screen and a final round are different problems." },
      { ic: "search", t: "Find similar roles", s: "Same stack, same season — the tailored résumé already exists." },
      { ic: "clock", t: "Nothing else tonight", s: "One rejection is not a signal. Don't rewrite anything over it." },
    ],
    notes: [
      { q: "A handful of applications is too few to learn from a rejection. You'd need dozens ending at the same stage before a pattern outranks luck.", src: "From your own tracker" },
      { q: "Most rejections carry no information at all. Headcount moved, a referral landed first, someone graduated a year closer. None of it was about you.", src: "InternPilot · field note" },
      { q: "The useful question is never why this one said no. It's whether the same stage keeps ending your applications — and you can't see that from one result.", src: "InternPilot · field note" },
    ],
    cta: "Find similar roles", alt: "Close", tone: TONE.rejected,
  },
  ghosted: {
    eyebrow: "No reply", title: (c) => `${c} has gone quiet`,
    sub: "Weeks of silence with no response — this one is likely done.",
    h3: "Two reasonable moves",
    steps: [
      { ic: "mail", t: "One follow-up, then stop", s: "Short, to the recruiter who posted it, referencing the role. Once only." },
      { ic: "list", t: "Or mark it closed and move on", s: "Long silence almost never turns into a reply." },
      { ic: "clock", t: "Either way, stop checking", s: "It's costing you attention your live applications could use." },
    ],
    notes: [
      { q: "Silence isn't rejection, but after long enough it's worth treating the same way — because the behaviour it should produce is identical.", src: "From your own tracker" },
      { q: "Companies don't close the loop because there's no incentive to. The absence of a no is a fact about their process, not your application.", src: "InternPilot · field note" },
      { q: "One follow-up is professional. Three is a decision about how you spend attention, and it's the wrong one.", src: "InternPilot · field note" },
    ],
    cta: "Draft the follow-up", alt: "Mark closed", tone: TONE.ghosted,
  },
};

const CONFETTI_COLORS = ["#F3B24E", "#63DCA9", "#8FC5FF", "#FF9E8A", "#ffffff"];

/** Statuses that get an outcome moment (ghosted is triggered separately). */
export function isMilestone(status: string): status is Kind {
  return status === "applied" || status === "oa" || status === "interview" || status === "offer" || status === "rejected";
}

function Journey({ reach, terminal, tone }: { reach: number; terminal: Terminal; tone: Tone }) {
  return (
    <div className="jrow">
      {STAGE_LABELS.map((lb, i) => {
        const cls = i < reach ? "done" : i === reach && !terminal ? "now" : "";
        return (
          <span key={lb} style={{ display: "contents" }}>
            {i > 0 && <span className={`jline ${i <= reach ? "done" : ""}`} style={{ ["--c" as string]: tone.c }} />}
            <span className={`jstep ${cls}`} style={{ ["--c" as string]: tone.c }}>
              <span className="d" dangerouslySetInnerHTML={{ __html: TICK }} />
              <span>{lb}</span>
            </span>
          </span>
        );
      })}
      {terminal && (
        <>
          <span className="jline stop" />
          <span className="jend">
            <span className={`d ${terminal === "ghosted" ? "grey" : ""}`}>{terminal === "ghosted" ? "–" : "✕"}</span>
            <span className={terminal === "ghosted" ? "grey" : ""}>{terminal === "ghosted" ? "No reply" : "Closed"}</span>
          </span>
        </>
      )}
    </div>
  );
}

export default function MilestoneCelebration({
  kind, company, role, stats, reach, terminal = null, onClose, onPrimary, onSecondary,
}: {
  kind: Kind;
  company: string;
  role: string;
  stats: [string, string][];
  reach: number;
  terminal?: Terminal;
  onClose: () => void;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  const m = CONTENT[kind];
  const [noteIdx, setNoteIdx] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const note = m.notes[noteIdx % m.notes.length];
  const noteGlow = m.tone.c === "var(--muted-2)" ? "rgba(150,170,195,.18)" : "rgba(91,155,246,.20)";
  const primaryBg = m.tone.c === "var(--muted-2)" ? "var(--ink)" : m.tone.c;

  return (
    <div className="ms-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ms-modal" role="dialog" aria-modal="true" aria-label={m.title(company)}>
        <div className={`hero h-${kind}`}>
          <span className="glow" />
          {m.confetti && (
            <div className="confetti" aria-hidden>
              {Array.from({ length: 28 }, (_, i) => (
                <i key={i} style={{
                  left: `${(i * 37 + 5) % 100}%`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  animationDelay: `${((i % 9) * 0.1).toFixed(2)}s`,
                }} />
              ))}
            </div>
          )}
          <button className="close" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <div className="art" dangerouslySetInnerHTML={{ __html: ART[kind] }} />
          <span className="eyebrow">{m.eyebrow}</span>
          <h2>{m.title(company)}</h2>
          <p>{role || m.sub}</p>
        </div>

        <div className="journey"><Journey reach={reach} terminal={terminal} tone={m.tone} /></div>

        <div className="stats">
          {stats.map(([b, s], i) => (
            <div className="stat" key={i}><b style={{ color: b.length < 4 ? m.tone.ink : "var(--ink)" }}>{b}</b><span>{s}</span></div>
          ))}
        </div>

        <div className="body">
          <h3>{m.h3}</h3>
          <ul className="steps">
            {m.steps.map((s, i) => (
              <li key={i} className={i === 0 ? "tap" : ""} onClick={i === 0 ? onPrimary : undefined}>
                <span className="ic" style={{ background: m.tone.soft, color: m.tone.ink }} dangerouslySetInnerHTML={{ __html: ICON[s.ic] }} />
                <span className="tx"><b>{s.t}</b><span>{s.s}</span></span>
                {i === 0 && <svg className="go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>}
              </li>
            ))}
          </ul>
        </div>

        <div className="note" style={{ ["--nc" as string]: noteGlow }}>
          <div className="note-top">
            <span className="idx">Field note {String((noteIdx % m.notes.length) + 1).padStart(2, "0")} / {String(m.notes.length).padStart(2, "0")}</span>
            <span className="rule" />
            <button className="shuffle" onClick={() => setNoteIdx((n) => n + 1)} title="Another note" aria-label="Shuffle note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M20 11A8 8 0 006.3 5.7L4 8M4 4v4h4" /><path d="M4 13a8 8 0 0013.7 5.3L20 16M20 20v-4h-4" /></svg>
            </button>
          </div>
          <q>{note.q}</q>
          <span className="src">{note.src}</span>
        </div>

        <div className="foot">
          <button className="btn" onClick={onSecondary ?? onClose}>{m.alt}</button>
          <button className="btn primary" style={{ background: primaryBg }} onClick={onPrimary}>{m.cta}</button>
        </div>
      </div>
    </div>
  );
}
