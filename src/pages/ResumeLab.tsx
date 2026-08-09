import { useEffect, useState } from "react";
import { createResumeVersion, listResumeVersions } from "../db/resumes";
import type { ResumeVersion } from "../db/types";
import { hasApiKey } from "../ai/settings";
import {
  gapFinder, rewriteResume, redFlagScan, hrRank,
  type GapResult, type RewriteResult, type RedFlagResult, type RankResult,
} from "../ai/resumeLab";

export default function ResumeLab() {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [jd, setJd] = useState("");

  const [gap, setGap] = useState<GapResult | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResult | null>(null);
  const [scan, setScan] = useState<RedFlagResult | null>(null);
  const [rank, setRank] = useState<RankResult | null>(null);
  const [busy, setBusy] = useState<"" | "gap" | "rewrite" | "scan" | "ats">("");
  const [err, setErr] = useState("");
  const [saveName, setSaveName] = useState("");

  useEffect(() => {
    listResumeVersions().then((v) => {
      setVersions(v);
      const withText = v.find((r) => r.content?.trim()) ?? v[0];
      if (withText) setSelId(withText.id);
    }).catch(console.error);
  }, []);

  const selected = versions.find((v) => v.id === selId) ?? null;
  const resumeText = selected?.content ?? "";

  async function run(tool: "gap" | "rewrite" | "scan" | "ats") {
    setErr(""); setBusy(tool);
    try {
      if (tool === "gap") setGap(await gapFinder(resumeText, jd));
      else if (tool === "rewrite") { const r = await rewriteResume(resumeText, jd); setRewrite(r); setSaveName(`${selected?.name ?? "Résumé"} — tailored`); }
      else if (tool === "ats") setRank(await hrRank(resumeText, jd || undefined));
      else setScan(await redFlagScan(resumeText, jd || undefined));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function saveRewrite() {
    if (!rewrite?.text.trim()) return;
    await createResumeVersion({ name: saveName.trim() || "Tailored résumé", content: rewrite.text, target_role: null });
    setVersions(await listResumeVersions());
    setErr("");
    setRewrite(null);
  }

  const noText = !resumeText.trim();

  return (
    <div className="lab">
      <div className="page-header">
        <div>
          <h1>Résumé Lab</h1>
          <p>AI tools to tailor and pressure-test your résumé against a specific job — grounded in what's already there.</p>
        </div>
      </div>

      <div className="card">
        <div className="lab-controls">
          <div className="field mb-0">
            <label htmlFor="lab-resume">Résumé</label>
            <select id="lab-resume" value={selId ?? ""} onChange={(e) => setSelId(Number(e.target.value) || null)}>
              {versions.length === 0 && <option value="">No résumés yet</option>}
              {versions.map((v) => <option key={v.id} value={v.id}>{v.name}{v.content?.trim() ? "" : " (no text)"}</option>)}
            </select>
          </div>
        </div>
        <div className="field mb-0" style={{ marginTop: 12 }}>
          <label htmlFor="lab-jd">Target job description (for Gap Finder &amp; Rewrite)</label>
          <textarea id="lab-jd" value={jd} onChange={(e) => setJd(e.target.value)} rows={5} placeholder="Paste the job description here…" />
        </div>
        {noText && <p className="hint text-red" style={{ marginTop: 10 }}>This résumé has no text. Add résumé text in Résumé Center (paste or upload) so the tools have something to work with.</p>}
        {!hasApiKey() && <p className="hint" style={{ marginTop: 10 }}>No OpenAI key set — Gap Finder &amp; Red-Flag run offline (lighter); Rewrite needs a key (Settings).</p>}
        {err && <p className="hint text-red" style={{ marginTop: 10 }}>{err}</p>}
      </div>

      {/* 0. HackerRank-style Rank */}
      <div className="card">
        <div className="lab-head"><div><h2>HackerRank Rank</h2><p className="sub">How HackerRank's intern screener would rank you — a faithful port of their public rubric. It rewards open-source &amp; shipped projects above all. Not an ATS check; scores are a band, not a grade.</p></div>
          <button type="button" onClick={() => run("ats")} disabled={busy !== "" || noText}>{busy === "ats" ? "Ranking…" : "Rank my résumé"}</button>
        </div>
        {rank && (
          <div className="ats">
            <div className="ats-top">
              <div className="ats-scorewrap">
                <div className="ats-ring" style={{ ["--v" as string]: `${Math.round(((rank.overall - rank.min) / (rank.max - rank.min)) * 100)}`, ["--c" as string]: rank.overall >= 80 ? "var(--beacon)" : rank.overall >= 45 ? "var(--accent)" : "var(--warn)" }}>
                  <b>{rank.overall}</b><span>of {rank.max}</span>
                </div>
                {rank.spread
                  ? <span className="ats-spread">{rank.spread.runs} runs ranged <b>{rank.spread.lo}–{rank.spread.hi}</b> — a band, not a grade</span>
                  : <span className="ats-spread">range {rank.min} to {rank.max}</span>}
              </div>
              <ul className="ats-cats">
                {rank.categories.map((c) => (
                  <li key={c.key}>
                    <div className="ats-cat-h"><span>{c.icon} {c.label}</span><b>{c.score}/{c.max}</b></div>
                    <div className="ats-bar"><i style={{ width: `${(c.score / c.max) * 100}%` }} /></div>
                    <span className="ats-note">{c.note}</span>
                  </li>
                ))}
                <li className="ats-adjust">
                  <div className="ats-cat-h"><span>Base + bonus − deductions</span>
                    <b>{rank.base} {rank.bonus ? <span className="pos">+{rank.bonus}</span> : null} {rank.deductions ? <span className="neg">−{rank.deductions}</span> : null} = {rank.overall}</b>
                  </div>
                  {rank.bonusNotes.length > 0 && <span className="ats-note pos">Bonus: {rank.bonusNotes.join(", ")}</span>}
                  {rank.deductionNotes.length > 0 && <span className="ats-note neg">Deductions: {rank.deductionNotes.join(", ")}</span>}
                </li>
              </ul>
            </div>
            {rank.integrity.length > 0 && (
              <div className="ats-integrity">
                <span className="eyebrow">⚠ Résumé integrity</span>
                <ul>{rank.integrity.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            {rank.fixes.length > 0 && (
              <div className="ats-fixes">
                <span className="eyebrow">Raise your rank</span>
                <ul>{rank.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            <p className="ats-undersell">ℹ This rubric is GitHub-centric by design — it only credits <b>public</b> work. Strong private or company codebases (NDA'd internships, closed-source products) won't show up here even though real employers value them. A low rank means "low on HackerRank's open-source signal," not "weak engineer."</p>
            {rank.source === "stub" && <span className="badge offline">Offline estimate — add an OpenAI key for the full screener read</span>}
          </div>
        )}
      </div>

      {/* 1. Gap Finder */}
      <div className="card">
        <div className="lab-head"><div><h2>Gap Finder</h2><p className="sub">Missing keywords, weak verbs, and vague claims vs. what you have.</p></div>
          <button type="button" onClick={() => run("gap")} disabled={busy !== "" || noText}>{busy === "gap" ? "Analyzing…" : "Find gaps"}</button>
        </div>
        {gap && (
          <>
            <p className="lab-summary">{gap.summary} {gap.source === "stub" && <span className="badge offline">Offline</span>}</p>
            {gap.rows.length === 0 ? <p className="muted-note">No gaps found.</p> : (
              <table className="lab-table">
                <thead><tr><th>Gap</th><th>Type</th><th>Currently</th></tr></thead>
                <tbody>{gap.rows.map((r, i) => <tr key={i}><td><b>{r.item}</b></td><td><span className="gap-type">{r.type}</span></td><td className="muted">{r.have}</td></tr>)}</tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* 2. One-Click Rewrite */}
      <div className="card">
        <div className="lab-head"><div><h2>One-Click Rewrite</h2><p className="sub">Tailor to this JD — mirror their language, one page, nothing invented.</p></div>
          <button type="button" onClick={() => run("rewrite")} disabled={busy !== "" || noText}>{busy === "rewrite" ? "Rewriting…" : "Rewrite for this JD"}</button>
        </div>
        {rewrite && (
          <>
            <textarea className="lab-rewrite" value={rewrite.text} onChange={(e) => setRewrite({ ...rewrite, text: e.target.value })} rows={16} />
            <div className="lab-save">
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="New version name" />
              <button type="button" onClick={saveRewrite}>Save as new version</button>
            </div>
          </>
        )}
      </div>

      {/* 3. Recruiter Red-Flag Scan */}
      <div className="card">
        <div className="lab-head"><div><h2>Recruiter Red-Flag Scan</h2><p className="sub">A 6-second recruiter read: what stands out, what to cut.</p></div>
          <button type="button" onClick={() => run("scan")} disabled={busy !== "" || noText}>{busy === "scan" ? "Scanning…" : "Recruiter scan"}</button>
        </div>
        {scan && (
          <div className="lab-scan">
            <div className="scan-first"><span className="eyebrow">First impression</span><p>{scan.firstImpression}</p></div>
            {scan.skipReasons.length > 0 && <div><span className="eyebrow">Would make me skip</span><ul>{scan.skipReasons.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
            {scan.cliches.length > 0 && <div><span className="eyebrow">Clichés to cut</span><div className="chips">{scan.cliches.map((c, i) => <span key={i} className="chip">{c}</span>)}</div></div>}
            {scan.fixes.length > 0 && <div><span className="eyebrow">Fixes</span><ul>{scan.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
            {scan.source === "stub" && <span className="badge offline">Offline scan</span>}
          </div>
        )}
      </div>
    </div>
  );
}
