// Content script: autofills text, selects, and radio groups from the profile,
// shows an on-page progress panel, and records the job to InternPilot.

// Field -> profile-key mapping, tested against each field's identifying text.
const MAP = [
  { key: "firstName", test: /first.?name|given.?name|\bfname\b/ },
  { key: "lastName", test: /last.?name|family.?name|surname|\blname\b/ },
  { key: "email", test: /e-?mail/ },
  { key: "phone", test: /phone|mobile|\btel\b/ },
  { key: "linkedin", test: /linkedin/ },
  { key: "github", test: /github/ },
  { key: "portfolio", test: /portfolio|personal.?(site|website)|website/ },
  { key: "school", test: /school|university|college|institution/ },
  { key: "degree", test: /degree/ },
  { key: "major", test: /major|field.?of.?study|discipline/ },
  { key: "gpa", test: /\bgpa\b|grade.?point/ },
  { key: "graduationDate", test: /grad(uation)?.?(date|month)|expected.?grad/ },
  { key: "gradYear", test: /grad(uation)?.?year|class.?of/ },
  { key: "address", test: /street|address(?!.*email)/ },
  { key: "city", test: /\bcity\b|\btown\b/ },
  { key: "state", test: /\bstate\b|province|county/ },
  { key: "country", test: /\bcountry\b/ },
  { key: "workAuthorization", test: /work.?authoriz|legally.?authoriz/ },
  { key: "authorizedToWork", test: /authorized.?to.?work|currently authorized/ },
  { key: "requiresSponsorship", test: /sponsor/ },
  { key: "gender", test: /\bgender\b/ },
  { key: "hispanicLatino", test: /hispanic|latino|latinx/ },
  { key: "race", test: /\brace\b|ethnic/ },
  { key: "veteranStatus", test: /veteran/ },
  { key: "disabilityStatus", test: /disab/ },
  { key: "desiredSalary", test: /salary|expected.?(pay|comp)|compensation/ },
  { key: "startDate", test: /start.?date|availab/ },
  { key: "willingToRelocate", test: /relocat/ },
  { key: "fullName", test: /full.?name|your.?name|(^|\s)name(\s|$)/ },
];

function keyFor(text) {
  const hay = (text || "").toLowerCase();
  for (const m of MAP) if (m.test.test(hay)) return m.key;
  return null;
}

function labelText(el) {
  const bits = [el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("autocomplete")];
  if (el.labels && el.labels[0]) bits.push(el.labels[0].innerText);
  const wrap = el.closest("label");
  if (wrap) bits.push(wrap.innerText);
  const by = el.getAttribute("aria-labelledby");
  if (by) { const l = document.getElementById(by); if (l) bits.push(l.innerText); }
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

// Build the list of fills to apply (so we can animate progress).
function collectTargets(profile) {
  const targets = [];
  const seen = new Set();

  document.querySelectorAll("input, textarea, select").forEach((el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (["hidden", "password", "file", "checkbox", "radio", "submit", "button"].includes(type)) return;
    if (el.value && el.value.trim()) return;
    const key = keyFor(labelText(el));
    if (!key) return;
    const value = profile[key];
    if (!value) return;
    const label = (labelText(el).split("\n")[0] || key).trim().slice(0, 60);
    targets.push({
      label,
      apply: () => (el.tagName === "SELECT" ? fillSelect(el, value) : (nativeSet(el, value), true)),
    });
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
    const label = norm(q).slice(0, 60) || key;
    if (seen.has(label)) return;
    seen.add(label);
    targets.push({ label, apply: () => { match.click(); return true; } });
  });

  return targets;
}

function guessJob() {
  const meta = (p) =>
    (document.querySelector(`meta[property="${p}"]`) || {}).content ||
    (document.querySelector(`meta[name="${p}"]`) || {}).content ||
    "";
  const company = meta("og:site_name") || location.hostname.replace(/^www\./, "").split(".")[0];
  const h1 = document.querySelector("h1");
  const title = meta("og:title") || (h1 && h1.innerText.trim()) || document.title;
  return { company, title: (title || "").slice(0, 140), url: location.href };
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
  root.innerHTML = `
    <style>
      *{box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,sans-serif}
      .launch{width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;
        background:linear-gradient(155deg,#3b85f5,#1a5bc4);color:#fff;font-weight:700;font-size:14px;
        box-shadow:0 6px 20px rgba(31,111,235,.4)}
      .panel{width:320px;max-height:72vh;overflow-y:auto;background:#fff;border:1px solid #e3e7ed;
        border-radius:14px;box-shadow:0 16px 40px rgba(15,27,45,.22);padding:16px;color:#0f1b2d;display:none}
      .panel.open{display:block}
      .hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .hdr b{font-size:14px}
      .x{border:none;background:none;cursor:pointer;color:#6b7a8d;font-size:16px}
      .status{font-size:12px;color:#6b7a8d;margin-bottom:10px}
      .status.ok{color:#157f5f}.status.err{color:#b03d2a}
      .btn{width:100%;padding:10px;border:none;border-radius:9px;background:#1f6feb;color:#fff;
        font-weight:600;font-size:13px;cursor:pointer;margin-bottom:10px}
      .btn:disabled{opacity:.6;cursor:default}
      .bar{height:6px;border-radius:3px;background:#eef1f5;overflow:hidden;margin-bottom:10px;display:none}
      .bar.on{display:block}.bar i{display:block;height:100%;background:#1f6feb;width:0;transition:width .2s}
      ul{list-style:none;margin:0;padding:0}
      li{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;padding:4px 0;color:#33445a}
      .ck{color:#16a34a;flex:none}
    </style>
    <button class="launch" title="InternPilot autofill">IP</button>
    <div class="panel">
      <div class="hdr"><b>InternPilot Autofill</b><button class="x">✕</button></div>
      <div class="status" id="st">Ready.</div>
      <button class="btn" id="run">Autofill this page</button>
      <div class="bar" id="bar"><i id="fill"></i></div>
      <ul id="list"></ul>
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
        const ok = targets[i].apply();
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

// popup can still trigger autofill + record
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.type === "autofill") {
    (async () => {
      try {
        const profile = await getProfile();
        const targets = collectTargets(profile);
        targets.forEach((t) => t.apply());
        await recordJob();
        sendResponse({ ok: true, filled: targets.length });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
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
