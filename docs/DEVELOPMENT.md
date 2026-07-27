# Development notes

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable, MSVC toolchain on Windows)
- Tauri prerequisites for your OS — see https://tauri.app/start/prerequisites/
  (Windows: WebView2 + the MSVC C++ build tools)

## Commands

```bash
npm install
npm run tauri dev      # run the desktop app in dev mode
npm run tauri build    # produce a production installer bundle
npm run build          # type-check + build the frontend only
```

## Networking behind a TLS-intercepting proxy

Some corporate networks / antivirus intercept HTTPS with a custom root CA, which breaks
default certificate verification for npm and cargo. This is environment-specific and does
**not** affect the shipped app — only building from source on such a network. Work around it
with:

- `NODE_OPTIONS=--use-system-ca` — lets npm/Node use the OS certificate store.
- `CARGO_HTTP_CHECK_REVOKE=false` — lets cargo skip the (failing) revocation check.

On other machines these are unnecessary.

## Releases

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds installers for
Windows, macOS, and Linux via `tauri-action` and attaches them to a draft GitHub Release.
