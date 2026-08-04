// Content script: autofills text, selects, and radio groups from the profile,
// shows an on-page progress panel, and records the job to InternPilot.

// Field -> profile-key mapping, tested against each field's identifying text.
// First match wins, so keep specific patterns above generic ones (fullName last).
const MAP = [
  { key: "firstName", test: /first.?name|given.?name|legal first|\bfname\b|preferred.?(first.?)?name|nickname/ },
  { key: "lastName", test: /last.?name|family.?name|surname|legal last|\blname\b/ },
  { key: "email", test: /e-?mail/ },
  { key: "phone", test: /phone|mobile|\btel\b|\bcell\b/ },
  { key: "linkedin", test: /linked.?in/ },
  { key: "github", test: /git.?hub/ },
  { key: "portfolio", test: /portfolio|personal.?(site|website)|\bwebsite\b|personal url|other url/ },
  { key: "school", test: /school|university|college|institution|alma mater|educational/ },
  { key: "degree", test: /degree|qualification level|level of education/ },
  { key: "major", test: /major|field.?of.?study|discipline|concentration|course of study|area of study/ },
  { key: "minor", test: /\bminor\b/ },
  { key: "gpa", test: /\bgpa\b|grade.?point/ },
  { key: "graduationDate", test: /grad(uation)?.?(date|month|term)|expected.?grad|completion date|(school|education).*(end date)/ },
  { key: "gradYear", test: /grad(uation)?.?year|class.?of|year of graduation|expected year/ },
  { key: "address", test: /street|address(?!.*email)|address line 1|mailing address/ },
  { key: "city", test: /\bcity\b|\btown\b|city\/town/ },
  { key: "state", test: /\bstate\b|province|region|\bcounty\b|state\/province/ },
  { key: "country", test: /\bcountry\b|country\/region|country of residence/ },
  { key: "authorizedToWork", test: /authorized to work|currently authorized|legally (eligible|authorized)|eligible to work|are you (legally )?authorized|right to work/ },
  { key: "requiresSponsorship", test: /sponsor|require.*visa|need.*visa|visa sponsorship/ },
  { key: "workAuthorization", test: /work.?authoriz|legally.?authoriz|employment.?authoriz|authorization status|work status|immigration status/ },
  { key: "gender", test: /\bgender\b|gender identity/ },
  { key: "hispanicLatino", test: /hispanic|latino|latinx/ },
  { key: "race", test: /\brace\b|ethnic|race\/ethnicity/ },
  { key: "veteranStatus", test: /veteran|protected veteran|military status/ },
  { key: "disabilityStatus", test: /disab/ },
  { key: "desiredSalary", test: /salary|expected.?(pay|comp)|compensation|desired.?pay|hourly rate|pay expectation/ },
  { key: "startDate", test: /start.?date|availab|when can you (start|begin)|earliest.*start|available to start/ },
  { key: "willingToRelocate", test: /relocat/ },
  { key: "fullName", test: /full.?name|your.?name|legal name|(^|\s)name(\s|$)/ },
];

function keyFor(text) {
  const hay = (text || "").toLowerCase();
  for (const m of MAP) if (m.test.test(hay)) return m.key;
  return null;
}

function labelText(el) {
  const bits = [
    el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"),
    el.getAttribute("autocomplete"), el.getAttribute("data-automation-id"),
    el.getAttribute("data-qa"), el.getAttribute("data-testid"), el.getAttribute("title"),
  ];
  if (el.labels && el.labels[0]) bits.push(el.labels[0].innerText);
  const wrap = el.closest("label");
  if (wrap) bits.push(wrap.innerText);
  const by = el.getAttribute("aria-labelledby");
  if (by) by.split(/\s+/).forEach((id) => { const l = document.getElementById(id); if (l) bits.push(l.innerText); });
  const desc = el.getAttribute("aria-describedby");
  if (desc) { const l = document.getElementById(desc); if (l) bits.push(l.innerText); }
  return bits.filter(Boolean).join(" ");
}

function nativeSet(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function norm(s) { return (s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

function fillSelect(el, value) {
  const v = norm(value);
  const opt = [...el.options].find((o) => norm(o.value) === v || norm(o.text) === v || norm(o.text).includes(v) || (v.length > 3 && v.includes(norm(o.text))));
  if (opt) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); return true; }
  return false;
}

// ---- radio groups ----
function radioQuestion(radio) {
  const fs = radio.closest("fieldset");
  if (fs) { const lg = fs.querySelector("legend"); if (lg && lg.innerText.trim()) return lg.innerText; }
  const grp = radio.closest('[role="radiogroup"],[role="group"]');
  if (grp && grp.getAttribute("aria-label")) return grp.getAttribute("aria-label");
  let node = radio.closest("div,li,section,p,td");
  for (let i = 0; i < 4 && node; i++) {
    const q = node.querySelector("legend,label,h1,h2,h3,h4,strong,p");
    if (q && !q.contains(radio) && q.innerText.trim().length > 4) return q.innerText;
    node = node.parentElement;
  }
  return radio.name || "";
}
function radioOptionText(radio) {
  if (radio.labels && radio.labels[0]) return radio.labels[0].innerText;
  const w = radio.closest("label");
  if (w) return w.innerText;
  return radio.value || radio.getAttribute("aria-label") || (radio.nextElementSibling && radio.nextElementSibling.innerText) || "";
}
function optionMatches(optText, desired) {
  const o = norm(optText), d = norm(desired);
  if (!o || !d) return false;
  return o === d || o.startsWith(d) || o.includes(d) || (d.length > 4 && d.includes(o));
}

// ---- custom dropdowns / comboboxes (react-select, Workday, generic) ----
function fireMouse(el, type) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
}
function visibleOptions() {
  return [...document.querySelectorAll('[role="option"], .select__option, [class*="-option"], ul[role="listbox"] li')]
    .filter((e) => e.offsetParent !== null && (e.textContent || "").trim());
}
function comboQuestion(ctrl) {
  if (ctrl.getAttribute("aria-label")) return ctrl.getAttribute("aria-label");
  const by = ctrl.getAttribute("aria-labelledby");
  if (by) { const l = document.getElementById(by.split(/\s+/)[0]); if (l && l.innerText.trim()) return l.innerText; }
  let node = ctrl.closest("[data-automation-id], .select__container, .field, div, fieldset");
  for (let i = 0; i < 5 && node; i++) {
    const q = node.querySelector("label, legend, .label, [class*='label']");
    if (q && !q.contains(ctrl) && q.innerText.trim().length > 2) return q.innerText;
    node = node.parentElement;
  }
  return ctrl.getAttribute("data-automation-id") || "";
}
async function pickCombo(ctrl, value) {
  ctrl.scrollIntoView({ block: "center" });
  fireMouse(ctrl, "mousedown"); fireMouse(ctrl, "mouseup");
  if (ctrl.click) ctrl.click();
  const input = ctrl.querySelector("input") || (ctrl.closest(".select__container") || document).querySelector("input");
  await sleep(150);
  let opts = visibleOptions();
  if (opts.length === 0 && input) { nativeSet(input, value); await sleep(220); opts = visibleOptions(); }
  const match = opts.find((o) => optionMatches(o.textContent, value)) ||
    opts.find((o) => norm(o.textContent).includes(norm(value)));
  if (match) {
    match.scrollIntoView({ block: "center" });
    fireMouse(match, "mousedown"); fireMouse(match, "mouseup");
    if (match.click) match.click();
    await sleep(60);
    return true;
  }
  fireMouse(document.body, "mousedown"); // close the menu if we couldn't match
  return false;
}

// Build the list of fills to apply (so we can animate progress). Each target's
// apply() may be sync or async (custom dropdowns need to open + pick).
function collectTargets(profile) {
  const targets = [];
  const seen = new Set();
  const pushT = (rawLabel, apply) => {
    const k = norm(rawLabel);
    if (!k || seen.has(k)) return;
    seen.add(k);
    targets.push({ label: (rawLabel || "").split("\n")[0].trim().slice(0, 60) || k, apply });
  };

  // text inputs, textareas, and native <select>
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (["hidden", "password", "file", "checkbox", "radio", "submit", "button", "search"].includes(type)) return;
    if (el.closest('.select__control, [role="combobox"], [role="listbox"]')) return; // custom widget, handled below
    if (el.value && el.value.trim()) return;
    const key = keyFor(labelText(el));
    if (!key) return;
    const value = profile[key];
    if (!value) return;
    if (el.tagName === "SELECT") pushT(labelText(el), () => fillSelect(el, value));
    else pushT(labelText(el), () => { nativeSet(el, value); return true; });
  });

  // radio groups (by name)
  const groups = {};
  document.querySelectorAll('input[type="radio"]').forEach((r) => {
    const name = r.name || Math.random().toString(36);
    (groups[name] = groups[name] || []).push(r);
  });
  Object.values(groups).forEach((radios) => {
    if (radios.some((r) => r.checked)) return; // already answered
    const q = radioQuestion(radios[0]);
    const key = keyFor(q);
    if (!key) return;
    const value = profile[key];
    if (!value) return;
    const match = radios.find((r) => optionMatches(radioOptionText(r), value));
    if (!match) return;
    pushT(q || key, () => { match.click(); return true; });
  });

  // custom dropdowns (react-select / Workday / generic combobox)
  document.querySelectorAll('.select__control, [role="combobox"]').forEach((ctrl) => {
    const q = comboQuestion(ctrl);
    const key = keyFor(q);
    if (!key) return;
    const value = profile[key];
    if (!value) return;
    pushT(q, () => pickCombo(ctrl, value));
  });

  // single yes/no checkboxes — only tick when the answer is affirmative
  document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    if (cb.checked) return;
    const q = labelText(cb) || radioOptionText(cb);
    const key = keyFor(q);
    if (!key) return;
    const v = norm(profile[key]);
    if (v !== "yes" && v !== "true") return;
    pushT(q, () => { cb.click(); return true; });
  });

  return targets;
}

function metaContent(p) {
  return (
    (document.querySelector(`meta[property="${p}"]`) || {}).content ||
    (document.querySelector(`meta[name="${p}"]`) || {}).content ||
    ""
  );
}

// Generic host/path tokens that are NOT company names.
const GENERIC = /^(jobs?|careers?|boards?|apply|job-boards|greenhouse|lever|ashby|ashbyhq|myworkdayjobs|wd\d+|smartrecruiters|icims|workday|recruiting|talent|app|www|secure|external|en|us)$/i;
const titleCase = (s) => (s || "").replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** Which ATS this page is (for the popup's source chip). */
function detectAts() {
  const h = location.hostname;
  if (/greenhouse\.io/.test(h)) return "Greenhouse";
  if (/lever\.co/.test(h)) return "Lever";
  if (/myworkdayjobs\.com|\.workday\./.test(h)) return "Workday";
  if (/ashbyhq\.com/.test(h)) return "Ashby";
  if (/icims\.com/.test(h)) return "iCIMS";
  if (/smartrecruiters\.com/.test(h)) return "SmartRecruiters";
  if (/bamboohr\.com/.test(h)) return "BambooHR";
  if (/workable\.com/.test(h)) return "Workable";
  if (/jobvite\.com/.test(h)) return "Jobvite";
  return "";
}

/** Best-effort company name — ATS-aware, so we don't return "jobs"/"boards". */
function guessCompany() {
  const host = location.hostname.replace(/^www\./, "");
  const parts = location.pathname.split("/").filter(Boolean);

  // ATS path-based: greenhouse/lever/ashby/smartrecruiters put the company first.
  if (/(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|jobvite\.com)$/.test(host) && parts[0] && !GENERIC.test(parts[0])) {
    return titleCase(parts[0]);
  }
  // Workday / iCIMS: company is a subdomain.
  const wd = host.match(/^([a-z0-9-]+)\.(?:wd\d+\.)?myworkdayjobs\.com$/i);
  if (wd && !GENERIC.test(wd[1])) return titleCase(wd[1]);
  const icims = host.match(/^(?:careers-)?([a-z0-9-]+)\.icims\.com$/i);
  if (icims && !GENERIC.test(icims[1])) return titleCase(icims[1]);

  // og:site_name if it isn't a generic ATS word.
  const site = metaContent("og:site_name");
  if (site && !GENERIC.test(site.replace(/\s+/g, ""))) return site.trim();

  // "Role at Company" / "Company - Role" from the title.
  const t = metaContent("og:title") || document.title || "";
  const atM = t.match(/\bat\s+([A-Z][\w.&' ]{1,40})$/);
  if (atM) return atM[1].trim();

  // First non-generic subdomain, else the registrable domain label.
  const labels = host.split(".");
  const sub = labels[0];
  if (!GENERIC.test(sub) && labels.length > 2) return titleCase(sub);
  const second = labels.length >= 2 ? labels[labels.length - 2] : sub;
  return titleCase(second);
}

function guessJob() {
  const h1 = document.querySelector("h1");
  let title = metaContent("og:title") || (h1 && h1.innerText.trim()) || document.title;
  const company = guessCompany();
  // Strip a trailing " at Company" / " - Company" from the title if present.
  if (company) {
    title = title.replace(new RegExp(`\\s*[-–—|]?\\s*(at\\s+)?${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();
  }
  return { company, title: (title || "").slice(0, 140), url: location.href };
}

/** Snapshot for the popup: ATS, fillable-field count, and whether a form exists. */
async function scanPage() {
  let count = 0;
  try { count = collectTargets(await getProfile()).length; } catch { /* not connected */ }
  const inputs = document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea, [role="combobox"]',
  ).length;
  const ats = detectAts();
  const job = guessJob();
  return { ats, count, formLikely: count > 0 || !!ats || inputs >= 6, ...job };
}

// Essay-style questions we can't answer from a flat profile.
const ESSAY_Q = /why|describe|tell us|cover letter|interest|challeng|experience|about you|motivat|passion|contribute|strength/i;

/** After filling, list what still needs the student's attention. */
function buildReview() {
  const items = [];
  const seen = new Set();
  const add = (kind, label) => {
    const k = norm(label);
    if (!k || seen.has(k)) return;
    seen.add(k);
    items.push({ kind, label: label.split("\n")[0].trim().slice(0, 72) });
  };
  document.querySelectorAll("textarea").forEach((t) => {
    if (t.value && t.value.trim()) return;
    const q = labelText(t);
    if (ESSAY_Q.test(q)) add("write", q || "Open-ended response");
  });
  document.querySelectorAll("input, select, [role=combobox], fieldset").forEach((el) => {
    const q = labelText(el) || (el.tagName === "FIELDSET" ? (el.querySelector("legend")?.innerText ?? "") : "");
    if (/sponsor|authoriz/i.test(q)) add("guess", q);
    else if (/salary|compensation|hourly|pay expect/i.test(q) && !(el.value && el.value.trim())) add("blank", q);
  });
  return items.slice(0, 6);
}

/** Fill everything, record the job, and report what happened (for the popup). */
async function autofillPage() {
  const profile = await getProfile();
  const targets = collectTargets(profile);
  let filled = 0;
  for (const t of targets) { try { if (await t.apply()) filled++; } catch { /* keep going */ } }
  await recordJob();
  return { filled, total: targets.length, review: buildReview(), ats: detectAts() };
}

// True while this content script's extension context is still valid. After the
// extension is reloaded/updated, old tabs keep running this stale script and
// any chrome.* call throws "Extension context invalidated" — detect that early.
function extAlive() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
}
async function sendBg(msg) {
  if (!extAlive()) throw new Error("Extension was updated — reload this page (F5) to reconnect.");
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    if (/context invalidated|receiving end does not exist|message port closed/i.test(m)) {
      throw new Error("Extension was updated — reload this page (F5) to reconnect.");
    }
    throw e;
  }
}

async function getProfile() {
  const r = await sendBg({ type: "getProfile" });
  if (!r || !r.ok) throw new Error(r && r.error ? r.error : "Could not load profile");
  return r.data || {};
}
async function recordJob() {
  return sendBg({ type: "recordApplication", payload: guessJob() });
}

// ============ on-page panel ============
let ui = null;
function ensureUI() {
  if (ui) return ui;
  const host = document.createElement("div");
  host.id = "internpilot-host";
  host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  const CHEV = `<svg viewBox="0 0 32 32" fill="none"><path d="M4.6 25.4 16 14l11.4 11.4" stroke="#fff" stroke-opacity=".5" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.4 9.6 16 4l5.6 5.6" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  root.innerHTML = `
    <style>
      *{box-sizing:border-box;font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif}
      .launch{width:52px;height:52px;border-radius:16px;border:none;cursor:pointer;padding:13px;
        background:linear-gradient(155deg,#3b85f5,#1a5bc4);box-shadow:0 8px 24px rgba(31,111,235,.42);
        transition:transform .12s, box-shadow .12s}
      .launch:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(31,111,235,.5)}
      .launch svg{width:100%;height:100%;display:block}
      .panel{width:340px;max-height:76vh;overflow-y:auto;background:#fff;border:1px solid #e7ebf0;
        border-radius:18px;box-shadow:0 20px 50px rgba(15,27,45,.26);color:#0f1b2d;display:none;overflow:hidden}
      .panel.open{display:block}
      .hdr{display:flex;align-items:center;gap:11px;padding:15px 16px 13px;
        background:linear-gradient(135deg,#f4f8ff,#fff);border-bottom:1px solid #eef1f5}
      .mark{width:32px;height:32px;border-radius:9px;flex:none;padding:7px;
        background:linear-gradient(155deg,#3b85f5,#1a5bc4);box-shadow:0 3px 9px rgba(31,111,235,.35)}
      .mark svg{width:100%;height:100%;display:block}
      .hdr .t{flex:1}
      .hdr b{font-size:14px;font-weight:700;letter-spacing:-.02em;display:block}
      .hdr span{font-size:11px;color:#6b7a8d}
      .x{border:none;background:none;cursor:pointer;color:#98a5b4;font-size:17px;line-height:1;padding:2px 4px;border-radius:6px}
      .x:hover{background:#f1f4f8;color:#33445a}
      .inner{padding:14px 16px 16px}
      .status{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:500;color:#33445a;
        background:#f7f9fb;border:1px solid #eef1f5;border-radius:9px;padding:9px 11px;margin-bottom:12px}
      .status::before{content:"";width:8px;height:8px;border-radius:50%;background:#98a5b4;flex:none}
      .status.ok{background:#e4f3ee;color:#157f5f;border-color:#cfeae0}.status.ok::before{background:#157f5f}
      .status.err{background:#fbeae6;color:#b03d2a;border-color:#f3d3cc}.status.err::before{background:#b03d2a}
      .btn{width:100%;padding:11px;border:none;border-radius:11px;cursor:pointer;font-weight:600;font-size:13px;
        color:#fff;background:linear-gradient(135deg,#3b85f5,#1a5bc4);box-shadow:0 2px 8px rgba(31,111,235,.32);
        display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .05s}
      .btn:active{transform:translateY(1px)}
      .btn:disabled{opacity:.6;cursor:default}
      .btn svg{width:15px;height:15px}
      .bar{height:7px;border-radius:5px;background:#eef1f5;overflow:hidden;margin:12px 0 4px;display:none}
      .bar.on{display:block}
      .bar i{display:block;height:100%;width:0;border-radius:5px;
        background:linear-gradient(90deg,#3b85f5,#1a5bc4);transition:width .25s cubic-bezier(.4,0,.2,1)}
      ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
      li{display:flex;gap:9px;align-items:center;font-size:12.5px;padding:5px 0;color:#33445a}
      .ck{width:18px;height:18px;border-radius:50%;background:#e4f3ee;color:#157f5f;flex:none;
        display:grid;place-items:center;font-size:11px;font-weight:700}
    </style>
    <button class="launch" title="InternPilot autofill">${CHEV}</button>
    <div class="panel">
      <div class="hdr">
        <span class="mark">${CHEV}</span>
        <div class="t"><b>InternPilot Autofill</b><span>Fill &amp; record this application</span></div>
        <button class="x" title="Close">✕</button>
      </div>
      <div class="inner">
        <div class="status" id="st">Ready.</div>
        <button class="btn" id="run">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg>
          Autofill this page
        </button>
        <div class="bar" id="bar"><i id="fill"></i></div>
        <ul id="list"></ul>
      </div>
    </div>`;
  document.documentElement.appendChild(host);
  const $ = (s) => root.querySelector(s);
  const panel = $(".panel");
  $(".launch").onclick = () => panel.classList.toggle("open");
  $(".x").onclick = () => panel.classList.remove("open");
  $("#run").onclick = runAutofill;
  ui = { root, $, panel };
  return ui;
}
function setStatus(text, kind) { const el = ensureUI().$("#st"); el.textContent = text; el.className = "status" + (kind ? " " + kind : ""); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAutofill() {
  const u = ensureUI();
  u.panel.classList.add("open");
  const runBtn = u.$("#run");
  runBtn.disabled = true;
  u.$("#list").innerHTML = "";
  u.$("#bar").classList.add("on");
  u.$("#fill").style.width = "0%";
  setStatus("Loading your profile…");
  try {
    const profile = await getProfile();
    const targets = collectTargets(profile);
    if (targets.length === 0) {
      setStatus("No matching fields found on this page.", "err");
    } else {
      for (let i = 0; i < targets.length; i++) {
        let ok = false;
        try { ok = await targets[i].apply(); } catch { ok = false; }
        u.$("#fill").style.width = `${Math.round(((i + 1) / targets.length) * 100)}%`;
        setStatus(`Autofilling… ${Math.round(((i + 1) / targets.length) * 100)}%`);
        if (ok) {
          const li = document.createElement("li");
          li.innerHTML = `<span class="ck">✓</span><span></span>`;
          li.lastElementChild.textContent = targets[i].label;
          u.$("#list").appendChild(li);
        }
        await sleep(45);
      }
      setStatus(`Filled ${targets.length} field${targets.length === 1 ? "" : "s"}. Review, then submit.`, "ok");
    }
    // record the job regardless of where you found it
    const rec = await recordJob();
    if (rec && rec.ok) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ck">✓</span><span>Added to your InternPilot applications</span>`;
      u.$("#list").appendChild(li);
    }
  } catch (e) {
    setStatus((e && e.message ? e.message : String(e)) + " — open the app & set the token in the extension popup.", "err");
  } finally {
    runBtn.disabled = false;
    u.$("#bar").classList.remove("on");
  }
}

// Popup <-> page messages
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.type === "autofill") {
    (async () => {
      try { sendResponse({ ok: true, ...(await autofillPage()) }); }
      catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }
  if (msg.type === "scan") {
    (async () => {
      try { sendResponse({ ok: true, ...(await scanPage()) }); }
      catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }
  if (msg.type === "guessJob") sendResponse({ ok: true, job: guessJob() });
});

// inject the launcher (skip inside iframes)
if (window.top === window) {
  if (document.body) ensureUI();
  else window.addEventListener("DOMContentLoaded", ensureUI);
}
