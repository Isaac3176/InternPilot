import { useEffect, useState } from "react";
import {
  DEFAULT_MODEL,
  getApiKey,
  getModel,
  setApiKey,
  setModel,
} from "../ai/settings";
import {
  getClientId,
  getClientSecret,
  getTokens,
  isConnected,
  setClientId,
  setClientSecret,
} from "../gmail/config";
import { connectGmail, disconnectGmail } from "../gmail/oauth";
import { getAccountEmail, logout } from "../auth";
import { BRIDGE_PORT, getBridgeToken } from "../bridge";
import {
  DEFAULT_AUTO_URL,
  DEFAULT_SIMPLIFY_URL,
  getAutoUrl,
  getSimplifyUrl,
  isAutoOn,
  isSimplifyOn,
  setAutoOn,
  setAutoUrl,
  setSimplifyOn,
  setSimplifyUrl,
} from "../listings/config";
import { probeSources, clearListingsCache, type SourceProbe } from "../listings/sources";
import { isLogosOn, setLogosOn, getLogoToken, setLogoToken } from "../listings/logo";
import { getPrefs, savePrefs, DEFAULT_PREFS, type RankingPrefs } from "../ranking/prefs";
import { learnSummary, resetLearning, type LearnSummary } from "../ranking/learning";
import { getPhoneAccess } from "../mobile/sync";
import { QRCodeSVG } from "qrcode.react";
import { cloudSignIn, cloudSignUp, cloudSignOut, cloudSession, onCloudAuth, cloudTestConnection } from "../cloud/auth";
import type { Session } from "@supabase/supabase-js";
import { getDb } from "../db";

export default function Settings() {
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [logoToken, setLogoTokenState] = useState(getLogoToken());
  const [model, setModelState] = useState(getModel());
  const [saved, setSaved] = useState(false);

  const [clientId, setClientIdState] = useState(getClientId());
  const [clientSecret, setClientSecretState] = useState(getClientSecret());
  const [connected, setConnected] = useState(isConnected());
  const [connecting, setConnecting] = useState(false);
  const [gmailError, setGmailError] = useState("");

  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  useEffect(() => {
    getAccountEmail().then(setAccountEmail).catch(console.error);
  }, []);

  // Internship sources
  const [simplifyOn, setSimplifyOnState] = useState(isSimplifyOn());
  const [simplifyUrl, setSimplifyUrlState] = useState(getSimplifyUrl());
  const [autoOn, setAutoOnState] = useState(isAutoOn());
  const [autoUrl, setAutoUrlState] = useState(getAutoUrl());
  const [logosOn, setLogosOnState] = useState(isLogosOn());

  // Ranking & alert preferences
  const [prefs, setPrefs] = useState<RankingPrefs>(getPrefs());
  const [prefsSaved, setPrefsSaved] = useState(false);
  function updPref<K extends keyof RankingPrefs>(k: K, v: RankingPrefs[K]) {
    setPrefs((p) => ({ ...p, [k]: v }));
    setPrefsSaved(false);
  }
  function num(v: string, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function csv(v: string): string[] {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  function saveRankingPrefs() {
    savePrefs(prefs);
    setPrefsSaved(true);
  }
  function resetRankingPrefs() {
    setPrefs({ ...DEFAULT_PREFS });
    savePrefs(DEFAULT_PREFS);
    setPrefsSaved(true);
  }

  // Learned preferences (adaptive)
  const [learn, setLearn] = useState<LearnSummary>(learnSummary());
  function resetLearned() { resetLearning(); setLearn(learnSummary()); }

  // Phone access (LAN)
  const [phone, setPhone] = useState<{ url: string; token: string }>({ url: "", token: "" });
  useEffect(() => { getPhoneAccess().then(setPhone).catch(() => {}); }, []);

  // Cloud sync (Supabase)
  const [cloud, setCloud] = useState<Session | null>(null);
  const [cEmail, setCEmail] = useState("");
  const [cPass, setCPass] = useState("");
  const [cMsg, setCMsg] = useState("");
  const [cBusy, setCBusy] = useState(false);
  useEffect(() => {
    cloudSession().then(setCloud).catch(() => {});
    return onCloudAuth(setCloud);
  }, []);
  async function cloudDo(fn: () => Promise<void>, ok: string) {
    setCBusy(true); setCMsg("");
    try { await fn(); setCMsg(ok); }
    catch (e) { setCMsg(e instanceof Error ? e.message : String(e)); }
    finally { setCBusy(false); }
  }
  const [probe, setProbe] = useState<{ simplify: SourceProbe; auto: SourceProbe } | null>(null);
  const [probing, setProbing] = useState(false);

  async function saveAndTestSources() {
    setSimplifyOn(simplifyOn);
    setAutoOn(autoOn);
    setSimplifyUrl(simplifyUrl.trim());
    setAutoUrl(autoUrl.trim());
    clearListingsCache(); // sources changed — drop the cached feed
    setProbing(true);
    try {
      setProbe(await probeSources());
    } catch (e) {
      console.error(e);
    } finally {
      setProbing(false);
    }
  }

  function resetSources() {
    setSimplifyUrl("");
    setAutoUrl("");
    setSimplifyUrlState(DEFAULT_SIMPLIFY_URL);
    setAutoUrlState(DEFAULT_AUTO_URL);
    setSimplifyOnState(true);
    setAutoOnState(true);
    setSimplifyOn(true);
    setAutoOn(true);
    clearListingsCache();
    setProbe(null);
  }

  function sourceStatus(p: SourceProbe | undefined): string {
    if (!p) return "";
    if (p.error) return `Error: ${p.error}`;
    return `${p.count} listing${p.count === 1 ? "" : "s"}`;
  }

  function signOut() {
    logout();
    window.location.reload();
  }

  function save() {
    setApiKey(apiKey.trim());
    setModel(model.trim() || DEFAULT_MODEL);
    setLogoToken(logoToken.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function connect() {
    setClientId(clientId.trim());
    setClientSecret(clientSecret.trim());
    setConnecting(true);
    setGmailError("");
    try {
      await connectGmail();
      setConnected(true);
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    disconnectGmail();
    setConnected(false);
  }

  async function exportData() {
    const db = await getDb();
    const tables = ["companies", "applications", "resume_versions", "resume_bullets", "tasks", "emails"];
    const dump: Record<string, unknown[]> = {};
    for (const t of tables) {
      dump[t] = await db.select(`SELECT * FROM ${t}`);
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "internpilot-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAll() {
    if (!confirm("Delete ALL local data? This cannot be undone.")) return;
    const db = await getDb();
    for (const t of ["tasks", "resume_bullets", "emails", "interviews", "interview_experiences", "applications", "resume_versions", "companies"]) {
      await db.execute(`DELETE FROM ${t}`);
    }
    alert("All data deleted.");
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>API keys, Gmail, AI model, and your local data.</p>
        </div>
      </div>

      <div className="card">
        <h2>Account</h2>
        <p className="hint mb-md">
          Signed in{accountEmail ? ` as ${accountEmail}` : ""}. Your login is local to this device.
        </p>
        <button type="button" className="secondary" onClick={signOut}>Log out</button>
      </div>

      <div className="card">
        <h2>Browser extension</h2>
        <p className="hint mb-md">
          The InternPilot extension autofills applications from your profile and records them here.
          It talks to the app over a local bridge, so <strong>keep the app running</strong> while you apply.
        </p>
        <div className="field">
          <label htmlFor="bridge-addr">Bridge address</label>
          <input id="bridge-addr" aria-label="Bridge address" readOnly value={`http://127.0.0.1:${BRIDGE_PORT}`} />
        </div>
        <div className="field">
          <label htmlFor="bridge-token">Connection token (paste into the extension)</label>
          <input id="bridge-token" aria-label="Connection token" readOnly value={getBridgeToken()} onFocus={(e) => e.target.select()} />
          <p className="hint">Keep this private — anything with this token can read your profile from the local bridge.</p>
        </div>
        <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(getBridgeToken()).catch(() => {})}>Copy token</button>
      </div>

      <div className="card">
        <h2>OpenAI</h2>
        <div className="field">
          <label htmlFor="s-key">API key</label>
          <input
            id="s-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKeyState(e.target.value)}
            placeholder="sk-..."
          />
          <p className="hint">
            Stored locally on this device only. Used for resume matching, prep plans, and the AI chat. Leave blank
            to use the offline estimate.
          </p>
        </div>
        <div className="field">
          <label htmlFor="s-model">Model</label>
          <input id="s-model" value={model} onChange={(e) => setModelState(e.target.value)} placeholder={DEFAULT_MODEL} />
        </div>
        <button type="button" onClick={save}>{saved ? "Saved ✓" : "Save settings"}</button>
      </div>

      <div className="card">
        <h2>Company logos</h2>
        <div className="field">
          <label htmlFor="s-logo">Logo.dev token <span className="hint" style={{ fontWeight: 400 }}>(optional, recommended)</span></label>
          <input
            id="s-logo"
            value={logoToken}
            onChange={(e) => setLogoTokenState(e.target.value)}
            placeholder="pk_..."
          />
          <p className="hint">
            For professional, high-coverage logos across the feed. Grab a free publishable token at{" "}
            <b>logo.dev</b> (it's client-safe). Without it, logos come from free sources (unavatar + DuckDuckGo)
            and fall back to a colored monogram — decent, but spottier. Saved locally on this device.
          </p>
        </div>
        <button type="button" onClick={save}>{saved ? "Saved ✓" : "Save settings"}</button>
      </div>

      <div className="card">
        <h2>Internship sources</h2>
        <p className="hint mb-md">
          The internship feed merges these sources and de-duplicates across them. Toggle or edit a URL,
          then Save &amp; test. Changes apply on the next Refresh in Internships.
        </p>

        <div className="field">
          <label className="check-row">
            <input type="checkbox" checked={simplifyOn} onChange={(e) => setSimplifyOnState(e.target.checked)} />
            <span>SimplifyJobs (curated)</span>
          </label>
          <input aria-label="SimplifyJobs URL" value={simplifyUrl} onChange={(e) => setSimplifyUrlState(e.target.value)} placeholder={DEFAULT_SIMPLIFY_URL} />
          {probe && <p className="hint">{sourceStatus(probe.simplify)}</p>}
        </div>

        <div className="field">
          <label className="check-row">
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOnState(e.target.checked)} />
            <span>Automated ATS engine (skills, salary, sponsorship)</span>
          </label>
          <input aria-label="Automated engine URL" value={autoUrl} onChange={(e) => setAutoUrlState(e.target.value)} placeholder={DEFAULT_AUTO_URL} />
          {probe && <p className="hint">{sourceStatus(probe.auto)}</p>}
        </div>

        <div className="field">
          <label className="check-row">
            <input
              type="checkbox"
              checked={logosOn}
              onChange={(e) => { setLogosOnState(e.target.checked); setLogosOn(e.target.checked); }}
            />
            <span>Show company logos</span>
          </label>
          <p className="hint">
            Loads each company's icon from DuckDuckGo / Google (domain guessed from the name). Turning this off
            keeps everything local — listings show a colored monogram instead, with no third-party image requests.
          </p>
        </div>

        <div className="actions">
          <button type="button" onClick={saveAndTestSources} disabled={probing}>{probing ? "Testing…" : "Save & test"}</button>
          <button type="button" className="secondary" onClick={resetSources}>Reset to defaults</button>
        </div>
      </div>

      <div className="card">
        <h2>Ranking &amp; alerts</h2>
        <p className="hint mb-md">
          Controls the Fast Apply queue and desktop notifications. A job is alerted only when it's both new and
          valuable to you. Manage which companies matter on the <strong>Watchlist</strong> page.
        </p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="rp-grad">Graduation year</label>
            <input id="rp-grad" type="number" value={prefs.graduationYear} onChange={(e) => updPref("graduationYear", num(e.target.value, DEFAULT_PREFS.graduationYear))} />
          </div>
          <div className="field">
            <label htmlFor="rp-fresh">Hide postings older than (days)</label>
            <input id="rp-fresh" type="number" value={prefs.freshnessDays} onChange={(e) => updPref("freshnessDays", num(e.target.value, DEFAULT_PREFS.freshnessDays))} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="rp-roles">Target roles (comma-separated)</label>
          <textarea id="rp-roles" value={prefs.targetRoles.join(", ")} onChange={(e) => updPref("targetRoles", csv(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="rp-blocked">Blocked roles (never shown)</label>
          <textarea id="rp-blocked" value={prefs.blockedRoles.join(", ")} onChange={(e) => updPref("blockedRoles", csv(e.target.value))} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="rp-instant">Instant alert score ≥</label>
            <input id="rp-instant" type="number" value={prefs.instantMin} onChange={(e) => updPref("instantMin", num(e.target.value, DEFAULT_PREFS.instantMin))} />
          </div>
          <div className="field">
            <label htmlFor="rp-standard">Standard notify score ≥</label>
            <input id="rp-standard" type="number" value={prefs.standardMin} onChange={(e) => updPref("standardMin", num(e.target.value, DEFAULT_PREFS.standardMin))} />
          </div>
          <div className="field">
            <label htmlFor="rp-digest">Digest score ≥</label>
            <input id="rp-digest" type="number" value={prefs.digestMin} onChange={(e) => updPref("digestMin", num(e.target.value, DEFAULT_PREFS.digestMin))} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="rp-max">Max instant alerts / day</label>
            <input id="rp-max" type="number" value={prefs.maxInstantPerDay} onChange={(e) => updPref("maxInstantPerDay", num(e.target.value, DEFAULT_PREFS.maxInstantPerDay))} />
          </div>
          <div className="field">
            <label htmlFor="rp-qs">Quiet hours start</label>
            <input id="rp-qs" type="number" min={0} max={23} value={prefs.quietStart} onChange={(e) => updPref("quietStart", num(e.target.value, DEFAULT_PREFS.quietStart))} />
          </div>
          <div className="field">
            <label htmlFor="rp-qe">Quiet hours end</label>
            <input id="rp-qe" type="number" min={0} max={23} value={prefs.quietEnd} onChange={(e) => updPref("quietEnd", num(e.target.value, DEFAULT_PREFS.quietEnd))} />
          </div>
        </div>

        <div className="actions">
          <button type="button" onClick={saveRankingPrefs}>Save preferences</button>
          <button type="button" className="secondary" onClick={resetRankingPrefs}>Reset to defaults</button>
          {prefsSaved && <span className="hint" style={{ alignSelf: "center" }}>Saved ✓</span>}
        </div>
      </div>

      <div className="card">
        <h2>Cloud sync <span className="badge interested">beta</span></h2>
        <p className="hint mb-md">
          Sign in to sync your data to the cloud so you can use InternPilot on your phone from any network.
          Foundation step — data-layer sync and the hosted phone app come next.
        </p>
        {cloud ? (
          <>
            <p className="hint mb-md">Signed in as <strong>{cloud.user.email}</strong>.</p>
            <div className="actions">
              <button type="button" disabled={cBusy} onClick={() => cloudDo(cloudTestConnection, "Connection OK — schema + security are working ✓")}>Test connection</button>
              <button type="button" className="secondary" disabled={cBusy} onClick={() => cloudDo(cloudSignOut, "Signed out.")}>Sign out</button>
            </div>
          </>
        ) : (
          <>
            <div className="field-row">
              <div className="field"><label htmlFor="c-email">Email</label><input id="c-email" type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} autoComplete="username" /></div>
              <div className="field"><label htmlFor="c-pass">Password</label><input id="c-pass" type="password" value={cPass} onChange={(e) => setCPass(e.target.value)} autoComplete="current-password" /></div>
            </div>
            <div className="actions">
              <button type="button" disabled={cBusy || !cEmail || !cPass} onClick={() => cloudDo(() => cloudSignIn(cEmail, cPass), "Signed in ✓")}>Sign in</button>
              <button type="button" className="secondary" disabled={cBusy || !cEmail || !cPass} onClick={() => cloudDo(async () => {
                const r = await cloudSignUp(cEmail, cPass);
                if (r === "already_exists") throw new Error("That email already has an account — sign in instead.");
              }, "Account created — confirm your email if prompted, then sign in.")}>Create account</button>
            </div>
          </>
        )}
        {cMsg && <p className="hint" style={{ marginTop: 10 }}>{cMsg}</p>}
      </div>

      <div className="card">
        <h2>Phone access</h2>
        <p className="hint mb-md">
          Use InternPilot on your phone over the same Wi-Fi — browse and queue roles to finish here with autofill.
          Keep this desktop app open. On your phone, open the address below in Safari, then <strong>Share → Add to Home Screen</strong>.
        </p>
        {phone.url ? (
          <>
            <div className="phone-connect">
              <div className="qr">
                <QRCodeSVG value={phone.url} size={168} marginSize={2} />
              </div>
              <div className="phone-connect-txt">
                <p className="hint" style={{ marginTop: 0 }}>Point your iPhone camera at this code, then tap the banner. Or copy the link.</p>
                <div className="field">
                  <label htmlFor="phone-url">Or open this on your phone</label>
                  <input id="phone-url" readOnly value={phone.url} onFocus={(e) => e.currentTarget.select()} />
                </div>
                <button type="button" onClick={() => navigator.clipboard?.writeText(phone.url).catch(() => {})}>Copy link</button>
              </div>
            </div>
            <p className="hint">The link includes your access token — treat it like a password (anyone on your Wi-Fi with it can see your search snapshot; your full profile stays on this computer). If the address doesn't load on your phone (e.g. you're on a VPN), use this PC's Wi-Fi IPv4 address instead of the one shown.</p>
          </>
        ) : (
          <p className="hint">Determining your local network address… (the bridge server must be running).</p>
        )}
      </div>

      <div className="card">
        <h2>Learned preferences</h2>
        <p className="hint mb-md">
          InternPilot nudges your ranking from repeated feedback on the Fast Apply queue (Good fit / Not a fit).
          One signal barely moves anything — patterns build over time. {learn.events} signal{learn.events === 1 ? "" : "s"} so far.
        </p>
        {learn.roles.length === 0 && learn.companies.length === 0 ? (
          <p className="muted-note">Nothing learned yet. Use 👍 Good fit / Not a fit on the queue and preferences will show here.</p>
        ) : (
          <div className="learn-tags">
            {learn.roles.map((r) => (
              <span key={`r-${r.key}`} className={`learn-tag ${r.weight > 0 ? "up" : "down"}`}>{r.key} {r.weight > 0 ? "▲" : "▼"}</span>
            ))}
            {learn.companies.map((c) => (
              <span key={`c-${c.key}`} className={`learn-tag ${c.weight > 0 ? "up" : "down"}`}>{c.key} {c.weight > 0 ? "▲" : "▼"}</span>
            ))}
          </div>
        )}
        {(learn.roles.length > 0 || learn.companies.length > 0) && (
          <div className="actions"><button type="button" className="secondary" onClick={resetLearned}>Reset learned preferences</button></div>
        )}
      </div>

      <div className="card">
        <h2>Gmail</h2>
        {connected ? (
          <>
            <p className="hint mb-md">
              Connected{getTokens()?.email ? ` as ${getTokens()?.email}` : ""}. InternPilot reads only job-related
              messages (read-only scope) and never modifies your inbox.
            </p>
            <button type="button" className="danger" onClick={disconnect}>Disconnect Gmail</button>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="g-id">Client ID</label>
              <input id="g-id" value={clientId} onChange={(e) => setClientIdState(e.target.value)} placeholder="...apps.googleusercontent.com" />
            </div>
            <div className="field">
              <label htmlFor="g-secret">Client secret</label>
              <input id="g-secret" type="password" value={clientSecret} onChange={(e) => setClientSecretState(e.target.value)} placeholder="From the same OAuth desktop credential" />
              <p className="hint">
                Read-only Gmail access via OAuth (loopback + PKCE). Tokens are stored locally. In "Testing" status
                Google expires access every ~7 days, so you may need to reconnect.
              </p>
            </div>
            <button type="button" onClick={connect} disabled={connecting}>
              {connecting ? "Waiting for Google…" : "Connect Gmail"}
            </button>
            {gmailError && <p className="hint text-red">{gmailError}</p>}
          </>
        )}
      </div>

      <div className="card">
        <h2>Your data</h2>
        <p className="hint mb-md">
          All application data is stored locally in SQLite. Nothing leaves your device except the text you send to
          OpenAI, and the job-related emails fetched from Gmail with your permission.
        </p>
        <button type="button" className="secondary" onClick={exportData}>Export data (JSON)</button>{" "}
        <button type="button" className="danger" onClick={deleteAll}>Delete all data</button>
      </div>
    </>
  );
}
