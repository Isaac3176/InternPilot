import type { ReactNode } from "react";

export function PageNotice({
  kind = "info",
  children,
}: {
  kind?: "info" | "success" | "error";
  children: ReactNode;
}) {
  return <p className={`page-notice ${kind}`}>{children}</p>;
}

export function LoadingState({ title = "Loading", detail }: { title?: string; detail?: string }) {
  return (
    <div className="empty state-empty loading-state">
      <span className="state-spinner" aria-hidden="true" />
      <b>{title}</b>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty state-empty">
      <b>{title}</b>
      {detail && <p>{detail}</p>}
      {action && <div className="state-actions">{action}</div>}
    </div>
  );
}
