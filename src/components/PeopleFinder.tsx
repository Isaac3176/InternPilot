import { useMemo, useState } from "react";
import { openExternal } from "../lib/open";
import {
  buildPlan, scoreContact, getChecklistState, setChecklistState, checklistFor,
} from "../networking/connections";
import { bestConnection, staleReferrals } from "../networking/graph";
import { createContact } from "../db/contacts";
import { createReferral } from "../db/referrals";
import { addEmployment, type ContactEmployment } from "../db/contactHistory";
import { RELATIONSHIP_TYPES, RELATIONSHIP_TYPE_LABELS, type ContactRow, type Profile, type ReferralRow, type RelationshipType } from "../db/types";

/**
 * "Find People" for a job — Connection Intelligence. Warm connections you
 * already have (with the best warm path), a prioritized who-to-find plan with
 * one-click LinkedIn/Google searches, capture-to-CRM for people you find, stale
 * follow-ups, and a networking checklist.
 */
export default function PeopleFinder({
  company, title, jd, profile, contacts, applicationId, referrals = [], employment, onSaved, onClose,
}: {
  company: string; title: string; jd?: string; profile: Profile | null; contacts: ContactRow[];
  applicationId?: number | null; referrals?: ReferralRow[]; employment?: Map<number, ContactEmployment[]>;
  onSaved?: () => void; onClose: () => void;
}) {
  const { team, tiers } = useMemo(() => buildPlan(company, title, jd, profile), [company, title, jd, profile]);
  const warm = useMemo(
    () => contacts.map((c) => scoreContact(c, team)).sort((a, b) => b.score - a.score),
    [contacts, team],
  );
  const best = useMemo(() => bestConnection(contacts, team, profile), [contacts, team, profile]);
  const stale = useMemo(() => staleReferrals(referrals), [referrals]);
  const steps = useMemo(() => checklistFor(company, !!profile?.school?.trim()), [company, profile]);
  const [done, setDone] = useState<Record<string, boolean>>(() => getChecklistState(company));

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ name: string; title: string; rel: RelationshipType; linkedin: string }>({ name: "", title: "", rel: "cold_outreach", linkedin: "" });
  const [saving, setSaving] = useState(false);
  async function saveContact() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const id = await createContact({ name: form.name.trim(), company_name: company, title: form.title.trim() || null, linkedin: form.linkedin.trim() || null, relationship_type: form.rel });
      if (id) {
        await addEmployment({ contact_id: id, company, title: form.title.trim() || null, is_current: true, source: "manual" });
        if (applicationId) await createReferral({ contact_id: id, application_id: applicationId, company_id: null, status: "potential_contact" });
      }
      setForm({ name: "", title: "", rel: "cold_outreach", linkedin: "" });
      setAdding(false);
      onSaved?.();
    } catch (e) { console.error("save contact failed", e); }
    finally { setSaving(false); }
  }
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
          {/* best path + your network here */}
          <section className="pf-sec">
            <div className="pf-sh">
              <h3>Your network here</h3>
              {warm.length > 0 && <span className="pf-badge good">{warm.length}</span>}
              <button type="button" className="pf-mini" style={{ marginLeft: "auto" }} onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add someone"}</button>
            </div>
            {best ? (
              <div className="pf-bestpath">
                <span className="eyebrow">Best path</span>
                <div className="pf-bp-row"><b>{best.path}</b><span className={"pf-score " + (best.scored.score >= 70 ? "hi" : best.scored.score >= 45 ? "mid" : "lo")}>{best.scored.score}</span></div>
                <p>{best.scored.action}</p>
              </div>
            ) : (
              <p className="pf-muted">No warm connection here yet — use the searches below (start with alumni), then add whoever you find.</p>
            )}
            {adding && (
              <div className="pf-addform">
                <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <select value={form.rel} onChange={(e) => setForm({ ...form, rel: e.target.value as RelationshipType })}>
                  {RELATIONSHIP_TYPES.map((r) => <option key={r} value={r}>{RELATIONSHIP_TYPE_LABELS[r]}</option>)}
                </select>
                <input placeholder="LinkedIn URL (optional)" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
                <button type="button" className="pf-mini primary" disabled={!form.name.trim() || saving} onClick={saveContact}>{saving ? "Saving…" : applicationId ? "Save & link to this role" : "Save contact"}</button>
              </div>
            )}
            {warm.slice(0, 6).map(({ contact, score, reasons, action }) => (
                <div className="pf-contact" key={contact.id}>
                  <span className="pf-av">{contact.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}</span>
                  <div className="pf-ctx">
                    <b>{contact.name}{contact.title ? <span className="pf-role"> · {contact.title}</span> : null}</b>
                    <span className="pf-reasons">{reasons.join(" · ")}</span>
                    {(() => { const h = employment?.get(contact.id) ?? []; return h.length > 1 ? <span className="pf-hist">History: {h.map((e) => e.company).join(" · ")}</span> : null; })()}
                    <span className="pf-action">{action}</span>
                  </div>
                  <div className="pf-cright">
                    <span className={"pf-score " + (score >= 70 ? "hi" : score >= 45 ? "mid" : "lo")}>{score}</span>
                    {contact.linkedin && <button type="button" className="pf-mini" onClick={() => openExternal(contact.linkedin!)}>Open</button>}
                  </div>
                </div>
              ))}
          </section>

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

          {/* stale outreach that needs action */}
          {stale.length > 0 && (
            <section className="pf-sec">
              <div className="pf-sh"><h3>Needs follow-up</h3><span className="pf-badge">{stale.length}</span></div>
              {stale.map((s, i) => (
                <div className="pf-stale" key={i}>
                  <span className={"pf-sdot " + s.severity} />
                  <span className="pf-stx"><b>{s.referral.contact_name ?? "A contact"}</b><span>{s.reason}{s.referral.role_title ? ` · ${s.referral.role_title}` : ""}</span></span>
                </div>
              ))}
            </section>
          )}

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
