import { useCallback, useEffect, useState } from "react";
import { deleteApplication, listApplications } from "../db/applications";
import { STATUSES, STATUS_LABELS, type ApplicationRow, type Status } from "../db/types";
import StatusBadge from "../components/StatusBadge";
import ApplicationModal from "../components/ApplicationModal";

export default function Applications() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationRow | null>(null);

  const load = useCallback(() => {
    listApplications({ search, status }).then(setRows).catch(console.error);
  }, [search, status]);

  useEffect(() => {
    load();
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
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Status</th>
              <th>Resume</th>
              <th>Applied</th>
              <th style={{ width: 130 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.company_name ?? <span className="muted">—</span>}</td>
                <td>{a.role_title}</td>
                <td><StatusBadge status={a.status} /></td>
                <td className="muted">{a.resume_version_name ?? "—"}</td>
                <td className="muted">{a.date_applied?.slice(0, 10) ?? "—"}</td>
                <td>
                  <button className="secondary small" onClick={() => openEdit(a)}>Edit</button>{" "}
                  <button className="danger small" onClick={() => handleDelete(a)}>Delete</button>
                </td>
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
    </>
  );
}
