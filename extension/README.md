# InternPilot Autofill — browser extension

Autofills job applications from your InternPilot profile and records them into the
app's tracker. It talks to the desktop app over a local bridge, so **the app must
be running** while you apply.

## Install (Chrome / Edge, unpacked)

1. Open the InternPilot app → **Settings → Browser extension** and copy your **token**.
2. In Chrome, go to `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select this `extension/` folder.
3. Click the InternPilot extension icon → open **Connection settings** → paste the
   **token** (port stays `8765`) → **Save**. You should see "Connected ✓".

## Use

- On an application page, click the extension → **Autofill this page**. It fills
  name, contact, links, education, work authorization, and EEO fields it can map.
- **Review everything, then submit yourself** (the extension never submits for you).
- Click **Save to InternPilot** to record the job in your Applications list
  (company/role are pre-guessed from the page; edit if needed).

## Notes & limits

- Autofill matches fields by their labels/names, so common forms and major ATS
  (Greenhouse, Lever, Workday, Ashby) fill well; unusual forms may fill partially.
- Checkboxes/radio groups are not auto-filled.
- The bridge is token-protected and local-only (`127.0.0.1`); nothing is sent to
  any server. Keep your token private.
