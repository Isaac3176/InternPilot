import { useState, type ReactNode } from "react";
import { userErrorMessage } from "../lib/errors";

export default function ConfirmAction({
  children,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  className,
  confirmClassName = "danger small",
  disabled = false,
  onConfirm,
}: {
  children: ReactNode;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
  confirmClassName?: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      setConfirming(false);
    } catch (e) {
      setError(userErrorMessage(e, "Couldn't complete that action."));
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span className="confirm-action" role="group" aria-label={message}>
        <span className="confirm-action-text">{message}</span>
        <button type="button" className={confirmClassName} onClick={confirm} disabled={busy}>
          {busy ? "Working..." : confirmLabel}
        </button>
        <button type="button" className="secondary small" onClick={() => setConfirming(false)} disabled={busy}>
          {cancelLabel}
        </button>
        {error && <span className="confirm-action-error">{error}</span>}
      </span>
    );
  }

  return (
    <button type="button" className={className} onClick={() => setConfirming(true)} disabled={disabled}>
      {children}
    </button>
  );
}
