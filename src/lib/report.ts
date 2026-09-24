import { captureError } from "./sentry";

/**
 * Single place errors are reported. Console logging keeps local debugging easy;
 * Sentry capture makes production failures visible without sprinkling SDK calls
 * through the app.
 */
export function reportError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  console.error(`[InternPilot] ${context}:`, err);
  captureError(context, err, extra);
}
