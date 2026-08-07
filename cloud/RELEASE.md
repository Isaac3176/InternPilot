# Cutting a desktop release (download links)

The `.github/workflows/release.yml` GitHub Action builds the installers for
Windows, macOS, and Linux and attaches them to a GitHub Release — so anyone can
download the desktop app.

## Release a new version
1. Bump the version in `src-tauri/tauri.conf.json` (`"version"`) and
   `package.json` if you like them in sync.
2. Tag and push:
   ```
   git tag v0.1.0
   git push origin v0.1.0
   ```
   (or run **Actions → Release → Run workflow** manually).
3. The workflow builds on all three OSes (~10–15 min) and creates a **draft**
   GitHub Release with the installers attached:
   - Windows: `.msi` and NSIS `.exe`
   - macOS: `.dmg`
   - Linux: `.AppImage` and `.deb`
4. Go to **Releases**, review the draft, and **Publish**. Share the release page
   link — that's your download page.

## Important caveats
- **Unsigned builds.** Without code-signing certificates, Windows SmartScreen
  shows "More info → Run anyway" and macOS Gatekeeper shows "unidentified
  developer" (right-click → Open the first time). Real signing needs a Windows
  cert and an Apple Developer account ($). Fine for sharing with friends;
  necessary for a polished public launch.
- **macOS from Windows:** you can't build macOS locally on Windows, but this CI
  builds it for you on a macOS runner.
- **Everyone signs in with their cloud account** — the desktop uses the same
  Supabase login as the web/phone, so downloaded copies just work with each
  user's own data (isolated by Row-Level Security).
