import { useMemo, useState } from "react";
import { openExternal } from "../lib/open";
import {
  buildPlan, scoreContact, getChecklistState, setChecklistState, checklistFor,
} from "../networking/connections";
import type { ContactRow, Profile } from "../db/types";

/**
 * "Find People" for a job — Connection Intelligence. Turns the posting + your
 * profile into warm connections you already have, a prioritized who-to-find plan
 * with one-click LinkedIn/Google searches, and a networking checklist.
 */
export default function PeopleFinder({
  company, title, jd, profile, contacts, onClose,
}: {
  company: string; title: string; jd?: string; profile: Profile | null; contacts: ContactRow[]; onClose: () => void;
}) {
  const { team, tiers } = useMemo(() => buildPlan(company, title, jd, profile), [company, title, jd, profile]);
  const warm = useMemo(
    () => contacts.map((c) => scoreContact(c, team)).sort((a, b) => b.score - a.score),
    [contacts, team],
  );
  const steps = useMemo(() => checklistFor(company, !!profile?.school?.trim()), [company, profile]);
  const [done, setDone] = useState<Record<string, boolean>>(() => getChecklistState(company));
  function toggle(id: string) {
    setDone((prev) => { const next = { ...prev, [id]: !prev[id] }; setChecklistState(company, next); return next; });
  }
  const grouped = useMemo(() => {
    const g: Record<string, typeof steps> = {};
    for (const s of steps) (g[s.group] = g[s.group] ?? []).push(s);
    return Object.entries(g);
  }, [steps]);
  const doneCount = steps.filter((s) => done[s.id]).length;

  return (
    <div className="pf-scrim" onClick={onClose}>
      <div className="pf" onClick={(e) => e.stopPropagation()}>
        <div className="pf-head">
          <div>
            <span className="eyebrow">Find people · Connection Intelligence</span>
            <h2>{company}</h2>
            <p>{title}</p>
          </div>
          <button type="button" className="pf-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pf-body">
          {/* warm connections you already have */}
          {warm.length > 0 && (
            <section className="pf-sec">
              <div className="pf-sh"><h3>Warm connections you already have</h3><span className="pf-badge good">{warm.length}</span></div>
              {warm.slice(0, 6).map(({ contact, score, reasons, action }) => (
                <div className="pf-contact" key={contact.id}>
                  <span className="pf-av">{contact.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}</span>
                  <div className="pf-ctx">
                    <b>{contact.name}{contact.title ? <span className="pf-role"> · {contact.title}</span> : null}</b>
                    <span className="pf-reasons">{reasons.join(" · ")}</span>
                    <span className="pf-action">{action}</span>
                  </div>
                  <div className="pf-cright">
                    <span className={"pf-score " + (score >= 70 ? "hi" : score >= 45 ? "mid" : "lo")}>{score}</span>
                    {contact.linkedin && <button type="button" className="pf-mini" onClick={() => openExternal(contact.linkedin!)}>Open</button>}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* extracted team */}
          {team.areas.length > 0 && (
            <section className="pf-sec">
              <div className="pf-sh"><h3>Likely team areas</h3></div>
              <div className="pf-chips">{team.areas.map((a) => <span className="pf-chip" key={a}>{a}</span>)}</div>
              <div className="pf-sublabel">People keywords</div>
              <div className="pf-chips">{team.keywords.map((k) => <span className="pf-chip ghost" key={k}>{k}</span>)}</div>
            </section>
          )}

          {/* who to find */}
          <section className="pf-sec">
            <div className="pf-sh"><h3>Who to find</h3><span className="pf-hint">Aim for 3–5 good contacts, not 50 random employees.</span></div>
            {tiers.map((t) => (
              <div className="pf-tier" key={t.key}>
                <div className="pf-tier-h">
                  <b>{t.label}</b>
                  <span className={"pf-pri " + (t.priority >= 85 ? "hi" : t.priority >= 70 ? "mid" : "lo")}>{t.priority}</span>
                </div>
                <p className="pf-why">{t.why}</p>
                {t.searches.map((s) => (
                  <div className="pf-search" key={s.query}>
                    <code>{s.query}</code>
                    <div className="pf-sbtns">
                      <button type="button" className="pf-mini primary" onClick={() => openExternal(s.linkedin)}>LinkedIn</button>
                      <button type="button" className="pf-mini" onClick={() => openExternal(s.google)}>Google</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>

          {/* checklist */}
          <section className="pf-sec">
            <div className="pf-sh"><h3>Networking plan</h3><span className="pf-badge">{doneCount}/{steps.length}</span></div>
            {grouped.map(([group, gsteps]) => (
              <div className="pf-cgroup" key={group}>
                <div className="pf-sublabel">{group}</div>
                {gsteps.map((s) => (
                  <label className={"pf-step" + (done[s.id] ? " on" : "")} key={s.id}>
                    <input type="checkbox" checked={!!done[s.id]} onChange={() => toggle(s.id)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
