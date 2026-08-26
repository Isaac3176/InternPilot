# InternPilot — Privacy Policy

> **DRAFT — not legal advice.** This template reflects how InternPilot actually
> handles data (see `PRIVACY.md`). Have a qualified attorney review and adapt it for
> your jurisdiction before publishing. Fill every **[bracketed]** placeholder.

**Effective date:** [DATE]
**Contact:** [YOUR-EMAIL]
**Operator:** [YOUR NAME / ENTITY] ("we", "us")

InternPilot helps you find, track, and prepare for internship applications. This
policy explains what we collect, how it's used, and your choices.

## 1. Information we collect

**You provide it:**
- **Account** — email address and (for local desktop accounts) a password, which is
  hashed on your device; we never see plaintext passwords.
- **Profile & application data** — name, contact details, links, education, work
  authorization, optional EEO fields, résumés and bullets, applications, contacts,
  referrals, interview/OA notes, coding-practice logs, and reusable answers you enter.

**You connect it (optional):**
- **Gmail (read-only)** — if you connect Gmail, we make read-only requests scoped to
  job-related mail to classify it (confirmation / rejection / OA / interview / offer).
  We do not modify or send email. You can disconnect at any time.
- **OpenAI API key** — if you add one, it's stored on your device and used to call
  OpenAI for the AI features. Without a key, offline fallbacks run instead.

**Collected automatically:**
- Minimal technical data required to operate (e.g., authentication session). We run
  **no third-party analytics or advertising trackers.**
  [If you add crash reporting (e.g., Sentry), disclose it here.]

## 2. How we use it

To provide the service: authenticate you, sync your data across your devices, rank
listings to your profile, generate AI assistance you request, and classify connected
email. We do **not** sell your data or use it for advertising.

## 3. Where your data lives

- **Cloud:** when signed in, your data is stored in our **Supabase** (PostgreSQL)
  database, protected by **Row-Level Security** so each account can access only its
  own rows. Hosting/subprocessors: **Supabase**, **Vercel** (web app hosting), and,
  when you invoke AI, **OpenAI** (processes only the text for that request).
- **Local:** the desktop app also keeps a local copy in an on-device database.

## 4. Sharing & disclosure

We share data only with the subprocessors above to run the service, or if required by
law. We never sell personal information.

## 5. Your choices & rights

- **Access/export** — export your data as JSON from Settings.
- **Delete** — delete your data from Settings, or request account deletion at
  [YOUR-EMAIL]; we will remove your records from the database.
- **Disconnect Gmail / remove your OpenAI key** at any time in Settings.
- Depending on where you live (e.g., **GDPR**, **CCPA**), you may have additional
  rights to access, correct, delete, or port your data — contact us to exercise them.

## 6. Data retention

We keep your data while your account is active. When you delete your account or data,
we remove it from the production database within [N] days, excluding backups that
expire on their normal cycle.

## 7. Security

Data is encrypted in transit (HTTPS). Access is scoped per-account by Row-Level
Security. No system is perfectly secure; see also the known limitation that
API keys/tokens are stored in app storage (being hardened). Report security issues to
[YOUR-EMAIL].

## 8. Children

InternPilot is not directed to children under [13/16]. We don't knowingly collect
their data.

## 9. Changes

We'll update this policy as the product changes and revise the effective date. Material
changes will be surfaced in-app or by email.

## 10. Contact

Questions or requests: **[YOUR-EMAIL]**.
