import { AscentIcon } from "./Logo";

const RELEASES = "https://github.com/Isaac3176/InternPilot/releases/latest";
const WIN = `${RELEASES}/download/InternPilot-Setup.exe`;
const MAC = `${RELEASES}/download/InternPilot.dmg`;
const LINUX = `${RELEASES}/download/InternPilot.AppImage`;

/**
 * Friendly "get the desktop app" panel — shown when a web user lands on a missing
 * page or a desktop-only feature (autofill extension, Gmail sync, AI with your own
 * key). Reuse it anywhere a feature isn't available in the browser.
 */
export default function DesktopPromo({ title, blurb }: { title?: string; blurb?: string }) {
  return (
    <div className="promo">
      <div className="promo-card">
        <div className="promo-logo"><AscentIcon size={34} /></div>
        <h2>{title ?? "This lives in the desktop app"}</h2>
        <p>{blurb ?? "A few InternPilot features run in the desktop app — the autofill browser extension, Gmail sync, and AI with your own OpenAI key. The web app covers discovering, ranking, tracking, and prep."}</p>
        <div className="promo-dl">
          <a className="btn primary" href={WIN}>⬇ Download for Windows</a>
          <a className="btn" href={MAC}>macOS</a>
          <a className="btn" href={LINUX}>Linux</a>
        </div>
        <a className="promo-all" href={RELEASES} target="_blank" rel="noreferrer">All installers &amp; release notes →</a>
      </div>
    </div>
  );
}
