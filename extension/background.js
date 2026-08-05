// Service worker: the only place allowed to talk to the local InternPilot bridge
// (avoids page CSP restrictions on the content script).

async function config() {
  const { token = "", port = 8765 } = await chrome.storage.local.get(["token", "port"]);
  return { token, port };
}

async function bridge(path, method, body) {
  const { token, port } = await config();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-IP-Token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Bridge responded ${res.status}`);
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ping") sendResponse({ ok: true, data: await bridge("/ping", "GET") });
      else if (msg.type === "getProfile") sendResponse({ ok: true, data: await bridge("/profile", "GET") });
      else if (msg.type === "getAnswers") sendResponse({ ok: true, data: await bridge("/answers", "GET") });
      else if (msg.type === "recordApplication") sendResponse({ ok: true, data: await bridge("/application", "POST", msg.payload) });
      else sendResponse({ ok: false, error: "unknown message" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // keep the channel open for the async response
});
