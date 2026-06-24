import { STATUS_LABELS, type Status } from "../db/types";

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}
