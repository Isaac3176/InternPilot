// Content script: fills form fields from the profile and guesses the job info.

// Field -> profile-key mapping, tested in priority order against each input's
// combined identifying text (name/id/placeholder/aria-label/associated label).
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
  { key: "city", test: /\bcity\b|\btown\b/ },
  { key: "state", test: /\bstate\b|province/ },
  { key: "country", test: /\bcountry\b/ },
  { key: "workAuthorization", test: /work.?authoriz|authorized.?to.?work|legally.?authorized/ },
  { key: "requiresSponsorship", test: /sponsor/ },
  { key: "gender", test: /\bgender\b/ },
  { key: "race", test: /\brace\b|ethnic/ },
  { key: "veteranStatus", test: /veteran/ },
  { key: "disabilityStatus", test: /disab/ },
  { key: "desiredSalary", test: /salary|expected.?(pay|comp)|compensation/ },
  { key: "startDate", test: /start.?date|availab/ },
  { key: "willingToRelocate", test: /relocat/ },
  { key: "fullName", test: /full.?name|(^|\s)name(\s|$)|your.?name/ },
];

function labelText(el) {
  const bits = [el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("autocomplete")];
  if (el.labels && el.labels[0]) bits.push(el.labels[0].innerText);
  const wrap = el.closest("label");
  if (wrap) bits.push(wrap.innerText);
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const l = document.getElementById(labelledby);
    if (l) bits.push(l.innerText);
  }
  return bits.filter(Boolean).join(" ").toLowerCase();
}

function nativeSet(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillSelect(el, value) {
  const v = value.toLowerCase();
  const opt = [...el.options].find(
    (o) => o.value.toLowerCase() === v || o.text.toLowerCase() === v || o.text.toLowerCase().includes(v),
  );
  if (opt) {
    el.value = opt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

function fillFields(profile) {
  const inputs = document.querySelectorAll("input, textarea, select");
  let filled = 0;
  inputs.forEach((el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (["hidden", "password", "file", "checkbox", "radio", "submit", "button"].includes(type)) return;
    if (el.value && el.value.trim()) return; // don't overwrite
    const hay = labelText(el);
    if (!hay) return;
    for (const m of MAP) {
      if (!m.test.test(hay)) continue;
      const value = profile[m.key];
      if (!value) return;
      if (el.tagName === "SELECT") {
        if (fillSelect(el, value)) filled++;
      } else {
        nativeSet(el, value);
        filled++;
      }
      return;
    }
  });
  return filled;
}

function guessJob() {
  const meta = (p) =>
    document.querySelector(`meta[property="${p}"]`)?.content ||
    document.querySelector(`meta[name="${p}"]`)?.content ||
    "";
  const company = meta("og:site_name") || location.hostname.replace(/^www\./, "").split(".")[0];
  const title = meta("og:title") || document.querySelector("h1")?.innerText?.trim() || document.title;
  return { company, title: (title || "").slice(0, 140), url: location.href };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "autofill") {
    chrome.runtime.sendMessage({ type: "getProfile" }).then((resp) => {
      if (!resp || !resp.ok) {
        sendResponse({ ok: false, error: resp?.error || "Could not load profile. Is InternPilot running and the token set?" });
        return;
      }
      sendResponse({ ok: true, filled: fillFields(resp.data || {}) });
    });
    return true;
  }
  if (msg.type === "guessJob") {
    sendResponse({ ok: true, job: guessJob() });
  }
});
