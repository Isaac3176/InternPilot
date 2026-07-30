# Browser extension — autofill & record

The InternPilot extension autofills job applications from your profile and records them into
the app's tracker. It's a Manifest V3 extension for **Chrome / Edge** (Chromium browsers).

It communicates with the desktop app over a **local, token-protected bridge**
(`http://127.0.0.1:8765`), so the **app must be running** while you apply. Nothing is sent to
any server — the bridge is local only.

## Install (unpacked)

1. Open the InternPilot app → **Settings → Browser extension** and copy your **token**
   (and note the bridge address / port, `8765`).
2. In Chrome or Edge, go to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the **`extension/`** folder from this repository.
5. Click the InternPilot toolbar icon → expand **Connection settings** →
   paste the **token**, confirm the port is `8765`, and click **Save**.
   You should see **"Connected ✓"**. (Use **Test** to re-check anytime.)

## Using it

On a job application page:

- **Autofill this page** — fills the fields it can map: name, email, phone, location, LinkedIn/
  GitHub/portfolio, school, degree, major, GPA, graduation, work authorization, and EEO/demographic
  text fields. It **never submits** — review everything, then submit yourself.
- **Save to InternPilot** — records the job in your Applications list (status "applied"). The
  company and role are pre-guessed from the page; edit them in the popup before saving.

## How it works

- The extension's **service worker** is the only part that calls the local bridge (this avoids
  page content-security-policy restrictions).
- The **content script** reads the profile (via the worker), matches fields by their labels /
  names / placeholders, and fills values with React-friendly events.
- **Save** posts `{ company, title, url }` to the bridge, which relays it to the app to insert.

## Limits & notes

- **The app must be running** and the token must match (Settings → Browser extension).
- Field matching is label/name based: **common forms and major ATS (Greenhouse, Lever, Workday,
  Ashby) fill well**; unusual or heavily custom forms may fill partially.
- **Checkboxes and radio groups are not auto-filled yet** (many EEO questions use these).
- Keep your token private — anything with it can read your profile from the local bridge. You can
  rotate it by clearing the app's local storage.

## Troubleshooting

- **"Not connected"** — is the app open? Is the token pasted correctly? Click **Test**.
- **Nothing fills** — the page may load its form in an iframe or render fields after load; try
  again once the form is visible, or fill the remaining fields manually.
