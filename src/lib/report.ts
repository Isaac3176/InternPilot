/**
 * Single place errors are reported. Right now it logs to the console; when a crash
 * reporter (e.g. Sentry) is added, wire it here and every call site is covered.
 * Use for failures that were previously swallowed silently — a caught data-load
 * error the user can't see should still be observable to us.
 */
export function reportError(context: string, err: unknown): void {
  console.error(`[InternPilot] ${context}:`, err);
  // e.g. Sentry.captureException(err, { tags: { context } });
}
