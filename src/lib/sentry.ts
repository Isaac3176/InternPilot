import * as Sentry from "@sentry/react";

const SENTRY_DSN = (import.meta.env.VITE_SENTRY_DSN ?? "").trim();
const SENTRY_ENVIRONMENT = (import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE).trim();
const SENTRY_TRACES_SAMPLE_RATE = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.05");
const SENTRY_ENABLED =
  import.meta.env.PROD &&
  SENTRY_DSN.length > 0 &&
  import.meta.env.VITE_SENTRY_DISABLED !== "1";

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|resume|body|notes?|content|answer|email|phone|address|linkedin|github|portfolio/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{16,}|sb_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;

function clampSampleRate(value: number): number {
  if (!Number.isFinite(value)) return 0.05;
  return Math.max(0, Math.min(1, value));
}

function scrubString(value: string): string {
  return value
    .replace(EMAIL_RE, "[Filtered email]")
    .replace(SECRET_RE, "[Filtered secret]");
}

function scrub(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return "[Filtered]";
  if (typeof value === "string") return scrubString(value);
  if (value == null || typeof value !== "object") return value;
  if (depth >= 5) return "[Filtered deep object]";
  if (Array.isArray(value)) return value.map((item) => scrub(item, key, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = scrub(childValue, childKey, depth + 1);
  }
  return out;
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  event.extra = scrub(event.extra, "extra") as Sentry.ErrorEvent["extra"];
  event.contexts = scrub(event.contexts, "contexts") as Sentry.ErrorEvent["contexts"];
  event.user = scrub(event.user, "user") as Sentry.ErrorEvent["user"];
  event.breadcrumbs = scrub(event.breadcrumbs, "breadcrumbs") as Sentry.ErrorEvent["breadcrumbs"];
  if (event.request) {
    const headers = "headers" in event.request ? event.request.headers : undefined;
    event.request = {
      ...event.request,
      cookies: undefined,
      data: undefined,
      headers: scrub(headers, "headers") as Record<string, string>,
    };
  }
  return event;
}

export function initSentry(): void {
  if (!SENTRY_ENABLED) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT || "production",
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: clampSampleRate(SENTRY_TRACES_SAMPLE_RATE),
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrub(breadcrumb, "breadcrumb") as Sentry.Breadcrumb,
    ignoreErrors: [
      "ResizeObserver loop completed with undelivered notifications",
      "ResizeObserver loop limit exceeded",
    ],
  });
}

export function captureError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  if (!SENTRY_ENABLED) return;
  Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
    tags: { area: context },
    extra: scrub(extra ?? {}, "extra") as Record<string, unknown>,
  });
}

export function sentryEnabled(): boolean {
  return SENTRY_ENABLED;
}
