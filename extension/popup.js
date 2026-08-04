const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

let job = { company: "", title: "", url: "" };

function status(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

const AVATAR = ["#1A1A1A", "#3E4C8C", "#33383D", "#4B4FD6", "#D6455E", "#157F5F", "#B03D2A", "#6B4A2F", "#7A5AF8", "#12509E"];
function avatarColor(name) {
  let h = 0;
  for (const c of name || "?") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
const sendBg = (msg) => chrome.runtime.sendMessage(msg);
async function sendTab(msg) {
  const tab = await activeTab();
  return chrome.tabs.sendMessage(tab.id, msg);
}

const REVIEW = {
  write: { flag: "✎", sub: "Long answer — draft it from your saved bullets." },
  guess: { flag: "?", sub: "Filled from your profile — verify the wording." },
  blank: { flag: "–", sub: "Left blank — add it if the form requires it." },
};

function onlyState(id) {
  ["detected", "result-state", "idle"].forEach((s) => (s === id ? show(s) : hide(s)));
}

function renderDetected(scan) {
  job = { company: scan.company || "", title: scan.title || "", url: scan.url || "" };
  const initial = (job.company || "?").trim().charAt(0).toUpperCase() || "?";
  $("job-logo").textContent = initial;
  $("job-logo").style.background = avatarColor(job.company);
  $("job-role").textContent = job.title || "Application";
  $("job-company").textContent = job.company || new URL(job.url || "https://x").hostname.replace(/^www\./, "");
  $("ats-name").textContent = scan.ats ? `${scan.ats} form` : "Application form";
  $("field-count").textContent = scan.count ? `${scan.count} fields` : "";
  $("fill-label").textContent = scan.count ? `Autofill ${scan.count} field${scan.count === 1 ? "" : "s"}` : "Autofill this page";
  onlyState("detected");
}

function renderResult(res) {
  $("result-count").textContent = `${res.filled} of ${res.total} field${res.total === 1 ? "" : "s"} filled`;
  $("result-sub").textContent = job.company ? `Added ${job.company} to your tracker` : "Added to your tracker";
  const review = res.review || [];
  if (review.length) {
    $("review-n").textContent = String(review.length);
    $("review").innerHTML = review.map((r) => {
      const meta = REVIEW[r.kind] || REVIEW.blank;
      return `<li><span class="flag ${r.kind}">${meta.flag}</span><span class="bd"><b></b><span>${meta.sub}</span></span></li>`;
    }).join("");
    // set labels as text (avoid HTML injection from page content)
    $("review").querySelectorAll("li .bd b").forEach((b, i) => (b.textContent = review[i].label));
    show("review-wrap");
  } else {
    hide("review-wrap");
  }
  onlyState("result-state");
}

async function runScan() {
  status("Connected to InternPilot ✓", "ok");
  $("headnote").textContent = "Profile synced";
  // résumé line from the bridge profile
  try {
    const pr = await sendBg({ type: "getProfile" });
    if (pr && pr.ok && pr.data && pr.data.resumeName) {
      $("resume-name").textContent = pr.data.resumeName;
      show("resume");
    }
  } catch { /* ignore */ }
  // scan the page
  try {
    const scan = await sendTab({ type: "scan" });
    if (scan && scan.ok && scan.formLikely) renderDetected(scan);
    else onlyState("idle");
  } catch {
    onlyState("idle"); // content script not present (chrome:// etc.)
  }
}

async function init() {
  const { token = "", port = 8765 } = await chrome.storage.local.get(["token", "port"]);
  $("token").value = token;
  $("port").value = port;

  const ping = await sendBg({ type: "ping" });
  if (ping && ping.ok) {
    hide("connect");
    await runScan();
  } else {
    status("Not connected. Add your token below.", "err");
    $("headnote").textContent = "Offline";
    show("connect");
    onlyState("idle");
  }
}

// ---- actions ----
$("gear").onclick = () => $("connect").classList.toggle("hidden");

$("save-settings").onclick = async () => {
  await chrome.storage.local.set({ token: $("token").value.trim(), port: Number($("port").value) || 8765 });
  await init();
};
$("test").onclick = async () => {
  const r = await sendBg({ type: "ping" });
  status(r && r.ok ? "Connected ✓" : "Not connected: " + (r && r.error), r && r.ok ? "ok" : "err");
};

$("autofill").onclick = async () => {
  status("Autofilling…");
  try {
    const r = await sendTab({ type: "autofill" });
    if (r && r.ok) { status("Connected to InternPilot ✓", "ok"); renderResult(r); }
    else status("Autofill error: " + (r && r.error ? r.error : "unknown"), "err");
  } catch {
    status("Can't autofill this page.", "err");
  }
};

$("save-only").onclick = async () => {
  const r = await sendBg({ type: "recordApplication", payload: { ...job, status: "interested" } });
  status(r && r.ok ? "Saved to your tracker ✓" : "Error saving.", r && r.ok ? "ok" : "err");
};

$("log-applied").onclick = async () => {
  const r = await sendBg({ type: "recordApplication", payload: { ...job, status: "applied" } });
  status(r && r.ok ? "Logged as applied ✓" : "Error saving.", r && r.ok ? "ok" : "err");
};

$("scan").onclick = runScan;

init();
