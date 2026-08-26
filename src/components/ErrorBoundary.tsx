import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../lib/report";

/**
 * Catches render/lifecycle crashes so one broken component doesn't white-screen the
 * whole app. Used at two levels: an outer boundary (the shell) and a page-level one
 * keyed by route (so navigating away clears the error and the sidebar survives a
 * single page crashing). `onError` is where a crash reporter (e.g. Sentry) hooks in.
 */
interface Props {
  children: ReactNode;
  /** "app" = full-screen fallback; "page" = inline fallback that keeps the shell. */
  level?: "app" | "page";
  onReset?: () => void;
}
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(`UI crash (${this.props.level ?? "app"})`, error);
    console.error(info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const full = this.props.level !== "page";
    return (
      <div className={`errb ${full ? "errb-full" : "errb-page"}`} role="alert">
        <div className="errb-card">
          <div className="errb-emoji" aria-hidden>🛟</div>
          <h2>Something broke on this screen</h2>
          <p>That's on us, not you — your data is safe. Try again, or head back home.</p>
          <div className="errb-actions">
            <button type="button" className="btn primary" onClick={this.reset}>Try again</button>
            <button type="button" className="btn" onClick={() => { window.location.assign("/"); }}>Go home</button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>Reload app</button>
          </div>
          <details className="errb-details">
            <summary>Technical details</summary>
            <pre>{`${error.message}\n\n${error.stack?.slice(0, 600) ?? ""}`}</pre>
          </details>
        </div>
      </div>
    );
  }
}
