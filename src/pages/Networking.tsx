import { useEffect, useState } from "react";
import { deleteContact, listContacts } from "../db/contacts";
import {
  deleteReferral,
  getNetworkingStats,
  listReferrals,
  setReferralStatus,
  type NetworkingStats,
} from "../db/referrals";
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LABELS,
  RELATIONSHIP_TYPE_LABELS,
  type ContactRow,
  type Profile,
  type ReferralRow,
  type ReferralStatus,
} from "../db/types";
import { getConversionByOutreach, getResumeVersionPerformance, type OutreachBucket, type ResumeVersionPerf } from "../db/metrics";
import { listAllEmployment, type ContactEmployment } from "../db/contactHistory";
import { getProfile } from "../db/profile";
import { networkMap } from "../networking/graph";
import { matchCompany } from "../ranking/companies";
import ContactModal from "../components/ContactModal";
import ReferralModal from "../components/ReferralModal";
import PeopleFinder from "../components/PeopleFinder";

const TERMINAL: ReferralStatus[] = ["declined", "no_response", "expired", "applied_through_referral"];

function statusBadgeClass(s: ReferralStatus): string {
  if (s === "referral_confirmed" || s === "applied_through_referral") return "offer";
  if (s === "declined" || s === "no_response" || s === "expired") return "rejected";
  if (s === "referral_agreed" || s === "referral_submitted") return "oa";
  return "interested";
}

function referralWarnings(r: ReferralRow): string[] {
  const warnings: string[] = [];
  if (r.status === "referral_agreed" && !r.confirmation_note?.trim()) {
    warnings.push("Marked agreed, but no confirmation recorded.");
  }
  if (r.status === "referral_confirmed" && r.thank_you_sent === 0) {
    warnings.push("Confirmed — no thank-you sent yet.");
  }
  if (r.next_follow_up && !TERMINAL.includes(r.status)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(r.next_follow_up) < today) warnings.push("Follow-up overdue.");
  }
  return warnings;
}

export default function Networking() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactModal, setContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [referralModal, setReferralModal] = useState(false);
  const [editingReferral, setEditingReferral] = useState<ReferralRow | null>(null);
  const [stats, setStats] = useState<NetworkingStats | null>(null);
  const [outreach, setOutreach] = useState<OutreachBucket[]>([]);
  const [resumePerf, setResumePerf] = useState<ResumeVersionPerf[]>([]);
  const [employment, setEmployment] = useState<ContactEmployment[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [peopleTarget, setPeopleTarget] = useState<{ company: string; contacts: ContactRow[] } | null>(null);

  function load() {
    listReferrals().then(setReferrals).catch(console.error);
    listContacts().then(setContacts).catch(console.error);
    getNetworkingStats().then(setStats).catch(console.error);
    getConversionByOutreach().then(setOutreach).catch(console.error);
    getResumeVersionPerformance().then(setResumePerf).catch(console.error);
    listAllEmployment().then(setEmployment).catch(console.error);
    getProfile().then(setProfile).catch(console.error);
  }

  const map = networkMap(contacts, employment, profile);
  function companyContactsFor(company: string): ContactRow[] {
    const lc = company.toLowerCase();
    const histIds = new Set(employment.filter((e) => e.company.toLowerCase() === lc).map((e) => e.contact_id));
    return contacts.filter((c) => (c.company_name ?? "").toLowerCase() === lc || histIds.has(c.id));
  }
  function employmentMap(): Map<number, ContactEmployment[]> {
    const m = new Map<number, ContactEmployment[]>();
    for (const e of employment) { const a = m.get(e.contact_id) ?? []; a.push(e); m.set(e.contact_id, a); }
    return m;
  }
  useEffect(load, []);

  async function changeStatus(id: number, status: ReferralStatus) {
    await setReferralStatus(id, status);
    load();
  }
  async function removeReferral(id: number) {
    if (!confirm("Delete this referral?")) return;
    await deleteReferral(id);
    load();
  }
  async function removeContact(id: number) {
    if (!confirm("Delete this contact?")) return;
    await deleteContact(id);
    load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Networking</h1>
          <p>Track contacts and referral paths from first outreach to confirmed referral.</p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => { setEditingContact(null); setContactModal(true); }}>+ Contact</button>
          <button type="button" onClick={() => { setEditingReferral(null); setReferralModal(true); }}>+ Referral</button>
        </div>
      </div>

      {map.length > 0 && (
        <div className="card">
          <h2>Your network map</h2>
          <p className="hint" style={{ marginTop: "-4px" }}>Warm paths from you to companies. <span className="nm-star">★</span> = on your watchlist. Click a company for the best path and to find more people.</p>
          <div className="nm">
            <div className="nm-you">YOU</div>
            <div className="nm-channels">
              {map.map((ch) => (
                <div className="nm-channel" key={ch.via}>
                  <div className="nm-via">{ch.via}<span className="nm-count">{ch.companies.length}</span></div>
                  <div className="nm-companies">
                    {ch.companies.map((co) => {
                      const t = matchCompany(co.name);
                      const isTarget = !!t && (t.priority === "instant" || t.priority === "high");
                      return (
                        <button type="button" key={co.name} className={"nm-co" + (isTarget ? " target" : "")}
                          onClick={() => setPeopleTarget({ company: co.name, contacts: companyContactsFor(co.name) })}
                          title={`Best-path score ${co.score}${isTarget ? " · on your watchlist" : ""}`}>
                          {isTarget && <span className="nm-star">★</span>}{co.name}<span className="nm-score">{co.score}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {stats && stats.totalPaths > 0 && (
        <div className="card">
          <h2>Networking analytics</h2>
          <div className="metric-grid">
            <Stat label="Response rate" value={`${stats.requestResponseRate}%`} n={stats.outreachSent} nLabel="sent" />
            <Stat label="Agreement rate" value={`${stats.agreementRate}%`} n={stats.outreachSent} nLabel="sent" />
            <Stat label="Confirmed rate" value={`${stats.confirmedRate}%`} n={stats.outreachSent} nLabel="sent" />
            <Stat label="Follow-ups due" value={String(stats.followUpsDue)} />
          </div>
          <h3 className="result-h3">OA & interview rate — with vs without a referral</h3>
          <table>
            <thead>
              <tr><th>Group</th><th>Applications</th><th>OA rate</th><th>Interview rate</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>With referral</td>
                <td>{stats.withReferral.count}</td>
                <td>{stats.withReferral.oaRate}%</td>
                <td>{stats.withReferral.interviewRate}%</td>
              </tr>
              <tr>
                <td>Without referral</td>
                <td>{stats.withoutReferral.count}</td>
                <td>{stats.withoutReferral.oaRate}%</td>
                <td>{stats.withoutReferral.interviewRate}%</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">
            Correlation only — small samples are unreliable. Treat rates based on fewer than ~10 applications as
            directional, not conclusive.
          </p>
        </div>
      )}

      {(outreach.some((b) => b.count > 0) || resumePerf.some((p) => p.total > 0)) && (
        <div className="card">
          <h2>What's actually working</h2>
          <p className="hint" style={{ marginTop: "-4px" }}>
            Outcome rates by how you applied. Correlation, not cause — anything under ~10 applications (marked
            <span className="small-n"> ·small n</span>) is directional only, not a reason to change your résumé.
          </p>

          <h3 className="result-h3">By outreach type</h3>
          <table>
            <thead><tr><th>How you applied</th><th>Apps</th><th>OA+</th><th>Interview+</th><th>Offer</th></tr></thead>
            <tbody>
              {outreach.filter((b) => b.count > 0).map((b) => (
                <tr key={b.key}>
                  <td>{b.label}{b.count < 10 && <span className="small-n" title="Small sample — directional only"> ·small n</span>}</td>
                  <td>{b.count}</td><td>{b.oaRate}%</td><td>{b.interviewRate}%</td><td>{b.offerRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {resumePerf.some((p) => p.total > 0) && (
            <>
              <h3 className="result-h3">By résumé version</h3>
              <table>
                <thead><tr><th>Version</th><th>Apps</th><th>OA+ rate</th><th>Interview rate</th><th>Offers</th></tr></thead>
                <tbody>
                  {resumePerf.filter((p) => p.total > 0).map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}{p.total < 10 && <span className="small-n" title="Small sample — directional only"> ·small n</span>}</td>
                      <td>{p.total}</td>
                      <td>{Math.round((p.reachedOa / p.total) * 100)}%</td>
                      <td>{Math.round((p.reachedInterview / p.total) * 100)}%</td>
                      <td>{p.offers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>Referral pipeline</h2>
        {referrals.length === 0 ? (
          <div className="empty">No referrals yet. Add one to start tracking a referral path.</div>
        ) : (
          referrals.map((r) => {
            const warnings = referralWarnings(r);
            return (
              <div className="card card-inset" key={r.id}>
                <div className="row-between">
                  <div>
                    <strong>{r.contact_name ?? "Unknown contact"}</strong>
                    <span className="muted">{r.company_name ? ` · ${r.company_name}` : ""}{r.role_title ? ` · ${r.role_title}` : ""}</span>
                    <div className="mt-xs">
                      <span className={`badge ${statusBadgeClass(r.status)}`}>{REFERRAL_STATUS_LABELS[r.status]}</span>
                      {r.next_follow_up && <span className="muted ml-xs">Follow up {r.next_follow_up}</span>}
                    </div>
                  </div>
                  <div className="actions">
                    <select aria-label="Referral status" value={r.status} onChange={(e) => changeStatus(r.id, e.target.value as ReferralStatus)}>
                      {REFERRAL_STATUSES.map((s) => (
                        <option key={s} value={s}>{REFERRAL_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button type="button" className="secondary small" onClick={() => { setEditingReferral(r); setReferralModal(true); }}>Edit</button>
                    <button type="button" className="danger small" onClick={() => removeReferral(r.id)}>Delete</button>
                  </div>
                </div>
                {warnings.map((w, i) => (
                  <p className="hint text-red mt-xs" key={i}>⚠ {w}</p>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <h2>Contacts</h2>
        {contacts.length === 0 ? (
          <div className="empty">No contacts yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Company</th><th>Relationship</th><th>Strength</th><th style={{ width: 130 }}></th></tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}{c.title ? <span className="muted"> · {c.title}</span> : ""}</td>
                  <td className="muted">{c.company_name ?? "—"}</td>
                  <td className="muted">{c.relationship_type ? RELATIONSHIP_TYPE_LABELS[c.relationship_type] : "—"}</td>
                  <td className="muted">{c.relationship_strength ?? "—"}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="secondary small" onClick={() => { setEditingContact(c); setContactModal(true); }}>Edit</button>
                      <button type="button" className="danger small" onClick={() => removeContact(c.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {contactModal && (
        <ContactModal initial={editingContact} onClose={() => setContactModal(false)} onSaved={() => { setContactModal(false); load(); }} />
      )}
      {referralModal && (
        <ReferralModal initial={editingReferral} onClose={() => setReferralModal(false)} onSaved={() => { setReferralModal(false); load(); }} />
      )}
      {peopleTarget && (
        <PeopleFinder
          company={peopleTarget.company}
          title="Software Engineer Intern"
          profile={profile}
          contacts={peopleTarget.contacts}
          referrals={referrals.filter((r) => (r.company_name ?? "").toLowerCase() === peopleTarget.company.toLowerCase())}
          employment={employmentMap()}
          onSaved={load}
          onClose={() => setPeopleTarget(null)}
        />
      )}
    </>
  );
}

function Stat({ label, value, n, nLabel }: { label: string; value: string; n?: number; nLabel?: string }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {n !== undefined && <div className="hint">n = {n}{nLabel ? ` ${nLabel}` : ""}</div>}
    </div>
  );
}
