const $ = (id) => document.getElementById(id);
let jobUrl = "";

function status(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const { token = "", port = 8765 } = await chrome.storage.local.get(["token", "port"]);
  $("token").value = token;
  $("port").value = port;

  // Connection check
  const ping = await chrome.runtime.sendMessage({ type: "ping" });
  if (ping && ping.ok) status("Connected to InternPilot ✓", "ok");
  else status("Not connected. Open the app and set the token below.", "err");

  // Guess job from the page
  try {
    const tab = await activeTab();
    const r = await chrome.tabs.sendMessage(tab.id, { type: "guessJob" });
    if (r && r.ok) {
      $("company").value = r.job.company || "";
      $("title").value = r.job.title || "";
      jobUrl = r.job.url || "";
    }
  } catch {
    /* content script not present on this page */
  }
}

$("save-settings").onclick = async () => {
  await chrome.storage.local.set({ token: $("token").value.trim(), port: Number($("port").value) || 8765 });
  const ping = await chrome.runtime.sendMessage({ type: "ping" });
  status(ping && ping.ok ? "Saved. Connected ✓" : "Saved, but not connected yet.", ping && ping.ok ? "ok" : "err");
};

$("test").onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: "ping" });
  status(r && r.ok ? "Connected ✓" : "Not connected: " + (r && r.error), r && r.ok ? "ok" : "err");
};

$("autofill").onclick = async () => {
  try {
    const tab = await activeTab();
    const r = await chrome.tabs.sendMessage(tab.id, { type: "autofill" });
    if (r && r.ok) status(`Filled ${r.filled} field${r.filled === 1 ? "" : "s"}.`, "ok");
    else status("Autofill error: " + (r && r.error ? r.error : "unknown"), "err");
  } catch {
    status("Can't autofill this page.", "err");
  }
};

$("save-job").onclick = async () => {
  const payload = { company: $("company").value.trim(), title: $("title").value.trim(), url: jobUrl };
  if (!payload.company && !payload.title) {
    status("Add a company or role first.", "err");
    return;
  }
  const r = await chrome.runtime.sendMessage({ type: "recordApplication", payload });
  status(r && r.ok ? "Saved to InternPilot ✓" : "Error: " + (r && r.error), r && r.ok ? "ok" : "err");
};

init();
