import { useEffect, useRef, useState } from "react";
import { cloudSignIn, cloudSignUp, cloudResetPassword } from "../cloud/auth";
import { getRemember, setRemember } from "../cloud/supabase";
import { AscentIcon } from "./Logo";
import { authErrorMessage } from "../lib/errors";
import { AUTH_CAPTCHA_ENABLED, TURNSTILE_SITE_KEY } from "../lib/features";

type View = "login" | "signup" | "reset";
type MessageKind = "error" | "info";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      }) => string;
      reset: (widgetId?: string) => void;
      remove?: (widgetId: string) => void;
    };
  }
}

/** Sign-in gate for the web/phone build (no local account — Supabase only). */
export default function CloudLogin({ onDone }: { onDone: () => void }) {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRememberState] = useState(getRemember());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<MessageKind>("error");
  const [notice, setNotice] = useState(""); // carried across views (e.g. after signup)
  const [captchaToken, setCaptchaToken] = useState("");

  const go = (v: View) => { setView(v); setMsg(""); setPassword(""); setConfirm(""); setCaptchaToken(""); };
  const showError = (text: string) => { setMsgKind("error"); setMsg(text); };
  const needsCaptcha = AUTH_CAPTCHA_ENABLED && (view === "login" || view === "signup");
  const authBlocked = busy || (needsCaptcha && !captchaToken);

  async function login() {
    if (needsCaptcha && !captchaToken) { showError("Complete the security check first."); return; }
    setBusy(true); setMsg("");
    setRemember(remember);
    try {
      await cloudSignIn(email, password, { captchaToken });
      onDone();
    } catch (e) {
      showError(authErrorMessage(e));
      setCaptchaToken("");
    } finally { setBusy(false); }
  }

  async function signup() {
    if (password !== confirm) { showError("Passwords don't match."); return; }
    if (password.length < 8) { showError("Use at least 8 characters."); return; }
    if (needsCaptcha && !captchaToken) { showError("Complete the security check first."); return; }
    setBusy(true); setMsg("");
    setRemember(remember);
    try {
      const result = await cloudSignUp(email, password, { captchaToken });
      if (result === "already_exists") {
        go("login"); // go() clears msg, so set it after
        showError("That email already has an account. Sign in, or use Forgot password.");
        return;
      }
      if (result === "confirm_email") {
        setNotice("Account created! Check your email to confirm it, then sign in.");
        go("login");
        return;
      }
      // created + immediate session (confirmation off)
      onDone();
    } catch (e) {
      showError(authErrorMessage(e));
      setCaptchaToken("");
    } finally { setBusy(false); }
  }

  async function reset() {
    setBusy(true); setMsg("");
    try {
      await cloudResetPassword(email);
      setNotice("If that email has an account, a password-reset link is on its way.");
      go("login");
    } catch (e) {
      showError(authErrorMessage(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-lg"><AscentIcon size={30} /> InternPilot AI</div>

        {notice && view === "login" && <p className="auth-notice">{notice}</p>}

        {view === "login" && (
          <>
            <h2>Sign in</h2>
            <p className="hint mb-md">Use your InternPilot cloud account to sync across your phone and desktop.</p>
            <Field id="cl-email" label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} />
            <Field id="cl-pass" label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword}
              onEnter={() => email && password && login()} />
            <div className="auth-row-between">
              <label className="remember-row">
                <input type="checkbox" checked={remember} onChange={(e) => setRememberState(e.target.checked)} />
                <span>Remember this device</span>
              </label>
              <button type="button" className="linklike" onClick={() => go("reset")}>Forgot password?</button>
            </div>
            {needsCaptcha && <TurnstileChallenge onToken={setCaptchaToken} />}
            <button type="button" style={{ width: "100%" }} disabled={authBlocked || !email || !password} onClick={login}>
              {busy ? "Signing in..." : "Log in"}
            </button>
            <p className="auth-switch">New to InternPilot? <button type="button" className="linklike" onClick={() => { setNotice(""); go("signup"); }}>Create an account</button></p>
          </>
        )}

        {view === "signup" && (
          <>
            <h2>Create your account</h2>
            <p className="hint mb-md">One account syncs your data across desktop, web, and phone.</p>
            <Field id="su-email" label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} />
            <Field id="su-pass" label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} />
            <Field id="su-confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm}
              onEnter={() => email && password && confirm && signup()} />
            <label className="remember-row">
              <input type="checkbox" checked={remember} onChange={(e) => setRememberState(e.target.checked)} />
              <span>Remember this device</span>
            </label>
            {needsCaptcha && <TurnstileChallenge onToken={setCaptchaToken} />}
            <button type="button" style={{ width: "100%" }} disabled={authBlocked || !email || !password || !confirm} onClick={signup}>
              {busy ? "Creating..." : "Create account"}
            </button>
            <p className="auth-switch">Already have an account? <button type="button" className="linklike" onClick={() => go("login")}>Sign in</button></p>
          </>
        )}

        {view === "reset" && (
          <>
            <h2>Reset password</h2>
            <p className="hint mb-md">We'll email you a link to set a new password.</p>
            <Field id="rs-email" label="Email" type="email" autoComplete="username" value={email} onChange={setEmail}
              onEnter={() => email && reset()} />
            <button type="button" style={{ width: "100%" }} disabled={busy || !email} onClick={reset}>
              {busy ? "Sending..." : "Send reset link"}
            </button>
            <p className="auth-switch"><button type="button" className="linklike" onClick={() => go("login")}>← Back to sign in</button></p>
          </>
        )}

        {msg && <p className={`hint ${msgKind === "error" ? "text-red" : ""}`} style={{ marginTop: 12 }}>{msg}</p>}
      </div>
    </div>
  );
}

function TurnstileChallenge({ onToken }: { onToken: (token: string) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = "turnstile-script";
    let cancelled = false;
    let timer: number | undefined;

    if (!document.getElementById(id)) {
      const script = document.createElement("script");
      script.id = id;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onerror = () => { if (!cancelled) setFailed(true); };
      document.head.appendChild(script);
    }

    const render = () => {
      if (cancelled) return;
      if (!boxRef.current || widgetRef.current) return;
      if (!window.turnstile) {
        timer = window.setTimeout(render, 100);
        return;
      }
      widgetRef.current = window.turnstile.render(boxRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => { setReady(true); setFailed(false); onToken(token); },
        "expired-callback": () => { setReady(false); onToken(""); },
        "error-callback": () => { setReady(false); setFailed(true); onToken(""); },
      });
    };
    render();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      if (widgetRef.current && window.turnstile?.remove) window.turnstile.remove(widgetRef.current);
      onToken("");
    };
  }, [onToken]);

  return (
    <div className="auth-captcha">
      <div ref={boxRef} />
      {!ready && <p className={`hint ${failed ? "text-red" : ""}`}>{failed ? "Security check failed to load. Refresh and try again." : "Complete the security check to continue."}</p>}
    </div>
  );
}

function Field({ id, label, type, autoComplete, value, onChange, onEnter }: {
  id: string; label: string; type: string; autoComplete: string; value: string;
  onChange: (v: string) => void; onEnter?: () => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }} />
    </div>
  );
}
