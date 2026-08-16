import { useCallback, useEffect, useState } from "react";
import { deleteApplication, listApplications, setApplicationStatus } from "../db/applications";
import { STATUSES, STATUS_LABELS, type ApplicationRow, type Status } from "../db/types";
import { APP_RECORDED_EVENT } from "../bridge";
import ApplicationModal from "../components/ApplicationModal";
import MilestoneCelebration, { isMilestone } from "../components/MilestoneCelebration";

/** Kebab (⋮) menu for a row — Edit / Delete, so the row itself stays clean. */
function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="row-menu">
      <button
        type="button"
        className="row-menu-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >⋮</button>
      {open && (
        <div className="row-menu-pop" onClick={(e) => e.stopPropagation()} role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>Edit details</button>
          <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}>Delete</button>
        </div>
      )}
    </div>
  );
}

export default function Applications() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationRow | null>(null);
  const [celebrate, setCelebrate] = useState<{ row: ApplicationRow; status: Status } | null>(null);

  const load = useCallback(() => {
    listApplications({ search, status }).then(setRows).catch(console.error);
  }, [search, status]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when the browser extension records a job while this page is open.
  useEffect(() => {
    window.addEventListener(APP_RECORDED_EVENT, load);
    return () => window.removeEventListener(APP_RECORDED_EVENT, load);
  }, [load]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: ApplicationRow) {
    setEditing(row);
    setModalOpen(true);
  }

  async function handleDelete(row: ApplicationRow) {
    if (!confirm(`Delete the ${row.role_title} application?`)) return;
    await deleteApplication(row.id);
    load();
  }

  async function changeStatus(row: ApplicationRow, next: Status) {
    if (next === row.status) return;
    // Optimistic: reflect the new status immediately.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
    try {
      await setApplicationStatus(row.id, next);
      if (isMilestone(next)) setCelebrate({ row: { ...row, status: next }, status: next });
    } catch (e) {
      console.error(e);
      load(); // revert on failure
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Every company, role, and status in one place.</p>
        </div>
        <button onClick={openNew}>+ New application</button>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search company, role, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No applications match. Add one to get started.</div>
      ) : (
        <table className="apps-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Company</th>
              <th>Role</th>
              <th>Status</th>
              <th>Resume</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="apps-menu-cell">
                  <RowMenu onEdit={() => openEdit(a)} onDelete={() => handleDelete(a)} />
                </td>
                <td>{a.company_name ?? <span className="muted">—</span>}</td>
                <td>{a.role_title}</td>
                <td>
                  <select
                    className={`badge ${a.status} status-pick`}
                    value={a.status}
                    onChange={(e) => changeStatus(a, e.target.value as Status)}
                    aria-label={`Status for ${a.role_title}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </td>
                <td className="muted">{a.resume_version_name ?? "—"}</td>
                <td className="muted">{a.date_applied?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <ApplicationModal
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}

      {celebrate && (
        <MilestoneCelebration
          status={celebrate.status}
          company={celebrate.row.company_name ?? "This company"}
          role={celebrate.row.role_title}
          onClose={() => { setCelebrate(null); load(); }}
          onDetails={() => { const r = celebrate.row; setCelebrate(null); load(); openEdit(r); }}
        />
      )}
    </>
  );
}
