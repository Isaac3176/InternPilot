import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { deleteApplication, GHOST_DAYS, listApplications, setApplicationStatus } from "../db/applications";
import { STATUSES, STATUS_LABELS, type ApplicationRow, type Status } from "../db/types";
import { matchCompany } from "../ranking/companies";
import { APP_RECORDED_EVENT } from "../bridge/shared";
import ApplicationModal from "../components/ApplicationModal";
import MilestoneCelebration, { isMilestone, type Kind, type Terminal } from "../components/MilestoneCelebration";
import CompanyLogo from "../components/CompanyLogo";
import ConfirmAction from "../components/ConfirmAction";
import { userErrorMessage } from "../lib/errors";
import { EmptyState, ErrorState, LoadingState, PageNotice } from "../components/PageState";

const JOURNEY_LABELS = ["Saved", "Applied", "OA", "Interview", "Offer"];
const journeyIndex = (s: Status): number =>
  s === "interested" ? 0 : s === "applied" ? 1 : s === "oa" ? 2 : s === "interview" ? 3 : s === "offer" ? 4 : 1;
const GHOST_ACK_KEY = "internpilot.ghosted.ack.v1";
interface Celebrate { kind: Kind; row: ApplicationRow; reach: number; terminal: Terminal; }

const NEXT: Record<Status, Status | null> = {
  interested: "applied", applied: "oa", oa: "interview", interview: "offer", offer: null, rejected: null,
};
const STAGE_VAR: Record<Status, string> = {
  interested: "--s-interested", applied: "--s-applied", oa: "--s-oa",
  interview: "--s-interview", offer: "--s-offer", rejected: "--s-rejected",
};
type Group = "act" | "wait" | "closed";
const GROUP_OF: Record<Status, Group> = {
  oa: "act", interview: "act", offer: "act", applied: "wait", interested: "wait", rejected: "closed",
};
const GROUP_META: Record<Group, { label: string; cls: string; order: number }> = {
  act: { label: "Needs action", cls: "urgent", order: 0 },
  wait: { label: "Waiting on them", cls: "", order: 1 },
  closed: { label: "Closed out", cls: "", order: 2 },
};

function daysSince(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}
function tierOf(company: string | null): string | null {
  const p = company ? matchCompany(company)?.priority : null;
  return p === "instant" ? "A" : p === "high" ? "B" : null;
}
function ageInfo(r: ApplicationRow): { big: string; small: string; cls: string } {
  if (r.status === "interested") return { big: "—", small: "not applied", cls: "" };
  const d = daysSince(r.date_applied ?? r.date_saved ?? r.created_at);
  const big = d != null ? `${d}d` : "—";
  if (r.status === "rejected") return { big, small: "closed", cls: "" };
  if (r.status === "applied") {
    const cls = d == null ? "" : d >= 21 ? "stale" : d >= 7 ? "warn" : "";
    return { big, small: "no reply", cls };
  }
  const small = r.status === "oa" ? "assessment" : r.status === "interview" ? "interviewing" : "offer";
  return { big, small, cls: "" };
}

const Chevron = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"><path d="M6 9l6 6 6-6" /></svg>
);

interface RowData {
  row: ApplicationRow;
  showGroup: boolean;
  groupLabel: string;
  groupCls: string;
  groupCount: number;
  tier: string | null;
  age: { big: string; small: string; cls: string };
  dupe: boolean;
  suspect: boolean;
  nx: Status | null;
}

/** A group-header separator row (e.g. "Needs action · 2"), rendered as its own
 * virtual item so the row list can be windowed without disturbing table layout. */
const GroupHeaderRow = forwardRef<HTMLTableRowElement, { label: string; cls: string; count: number; "data-index": number }>(
  function GroupHeaderRow({ label, cls, count, "data-index": dataIndex }, ref) {
    return (
      <tr className="grouprow" ref={ref} data-index={dataIndex}>
        <td colSpan={6}>
          <span className={`grouplab ${cls}`}>
            <span className="eyebrow">{label}</span>
            <span className="rule" />
            <span className="n">{count}</span>
          </span>
        </td>
      </tr>
    );
  },
);

/** One tracker row. Memoized so a change to one row (e.g. opening its status
 * popover) doesn't re-render every other row — all its derived data (tier, age,
 * dupe/suspect flags, group counts) is precomputed once by the parent instead of
 * recalculated here on every render. Forwards its ref/`tr` node so the row
 * virtualizer can measure it (rows aren't uniform height). */
const AppRow = memo(forwardRef<HTMLTableRowElement, {
  data: RowData;
  isPopOpen: boolean;
  "data-index": number;
  onTogglePop: (id: number) => void;
  onClosePop: () => void;
  onChangeStatus: (row: ApplicationRow, next: Status) => void;
  onAdvance: (row: ApplicationRow) => void;
  onEdit: (row: ApplicationRow) => void;
  onDelete: (row: ApplicationRow) => void;
}>(function AppRow({
  data, isPopOpen, "data-index": dataIndex, onTogglePop, onClosePop, onChangeStatus, onAdvance, onEdit, onDelete,
}, ref) {
  const { row: r, tier, age, dupe, suspect, nx } = data;
  return (
    <tr ref={ref} data-index={dataIndex}>
      <td>
        <span className="co">
          <CompanyLogo company={r.company_name ?? "—"} />
          <span className="tx">
            <b>{r.company_name ?? "—"}{tier && <span className="tierbadge">TIER {tier}</span>}</b>
            <span>{r.location || "—"}</span>
          </span>
        </span>
      </td>
      <td>
        <span className={`role ${suspect ? "suspect" : ""}`} title={r.role_title}>{r.role_title}</span>
        {suspect && <span className="flag" title="Looks like a page title, not a role — re-check the source.">Check title</span>}
        {dupe && <span className="flag" title="A near-identical row exists. Merge?">Possible dupe</span>}
      </td>
      <td className="statuscell">
        <button className={`status ${r.status}`} onClick={(e) => { e.stopPropagation(); onTogglePop(r.id); }}>
          <i />{STATUS_LABELS[r.status]}<Chevron />
        </button>
        {nx && <button className="quick" onClick={() => onAdvance(r)}>→ {STATUS_LABELS[nx]}</button>}
        {isPopOpen && (
          <div className="pop" onClick={(e) => e.stopPropagation()}>
            <span className="eyebrow lab">Move to</span>
            {STATUSES.map((s, k) => (
              <button key={s} className={`popitem ${s === r.status ? "cur" : ""}`} onClick={() => onChangeStatus(r, s)}>
                <i style={{ background: `var(${STAGE_VAR[s]})` }} />
                <span className="lbl">{STATUS_LABELS[s]}</span>
                <span className="k">{k + 1}</span>
              </button>
            ))}
            <div className="popsep" />
            <button className="popitem" onClick={() => { onClosePop(); onEdit(r); }}>
              <span className="lbl" style={{ color: "var(--muted)" }}>Add a note instead</span>
            </button>
          </div>
        )}
      </td>
      <td className="hidesm">
        {r.resume_version_name
          ? <span className="rchip">{r.resume_version_name}</span>
          : <span className="rchip none">None attached</span>}
      </td>
      <td className={`age ${age.cls}`}><b>{age.big}</b><span>{age.small}</span></td>
      <td>
        <span className="rowacts">
          <button className="ibtn" title="Edit" aria-label={`Edit ${r.role_title}`} onClick={() => onEdit(r)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
          </button>
          <ConfirmAction className="ibtn danger" ariaLabel={`Delete ${r.role_title}`} message={`Delete ${r.role_title}?`} confirmLabel="Delete" onConfirm={() => onDelete(r)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13" /></svg>
          </ConfirmAction>
        </span>
      </td>
    </tr>
  );
}));

export default function Applications() {
  const navigate = useNavigate();
  const [all, setAll] = useState<ApplicationRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationRow | null>(null);
  const [openPop, setOpenPop] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState<Celebrate | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const ghostShownRef = useRef(false);

  const load = useCallback((clearMessage = true) => {
    setLoading(true);
    listApplications({ search, status: "all" })
      .then((rows) => { setAll(rows); if (clearMessage) { setError(""); setNotice(""); } })
      .catch((e) => setError(userErrorMessage(e, "Couldn't load applications.")))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onRecorded = () => load();
    window.addEventListener(APP_RECORDED_EVENT, onRecorded);
    return () => window.removeEventListener(APP_RECORDED_EVENT, onRecorded);
  }, [load]);

  // Close the status popover on any outside click.
  useEffect(() => {
    if (openPop == null) return;
    const close = () => setOpenPop(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openPop]);

  // Keyboard: 1–6 sets the stage while a popover is open; Esc closes things.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenPop(null); return; }
      if (openPop != null && /^[1-6]$/.test(e.key)) {
        const row = all.find((r) => r.id === openPop);
        if (row) changeStatus(row, STATUSES[+e.key - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPop, all]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of all) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [all]);

  // Duplicate detection: same company + role + applied date.
  const dupeKeys = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of all) {
      const k = `${(r.company_name ?? "").toLowerCase()}|${r.role_title.toLowerCase()}|${r.date_applied ?? ""}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return seen;
  }, [all]);
  function isDupe(r: ApplicationRow): boolean {
    return (dupeKeys.get(`${(r.company_name ?? "").toLowerCase()}|${r.role_title.toLowerCase()}|${r.date_applied ?? ""}`) ?? 0) > 1;
  }
  function isSuspect(r: ApplicationRow): boolean {
    return /\b(careers?|experience site|lateral)\b/i.test(r.role_title) && r.role_title.split(/\s+/).length <= 4;
  }

  const view = useMemo(() => {
    const rows = filter === "all" ? all : all.filter((r) => r.status === filter);
    return [...rows].sort((a, b) => {
      const ga = GROUP_META[GROUP_OF[a.status]].order, gb = GROUP_META[GROUP_OF[b.status]].order;
      if (ga !== gb) return ga - gb;
      return (daysSince(b.date_applied ?? b.date_saved) ?? 0) - (daysSince(a.date_applied ?? a.date_saved) ?? 0);
    });
  }, [all, filter]);

  // One pass over `view` instead of a `.filter()` per row inside the render loop
  // (that was O(n²) on the number of tracked applications).
  const groupCounts = useMemo(() => {
    const counts: Partial<Record<Group, number>> = {};
    for (const r of view) { const g = GROUP_OF[r.status]; counts[g] = (counts[g] ?? 0) + 1; }
    return counts;
  }, [view]);

  // All per-row derived data computed once here (not per-row on every render),
  // and handed to a memoized <AppRow> so changing one row (e.g. its popover)
  // doesn't force every other row to re-render.
  const rowsData: RowData[] = useMemo(() => view.map((r, i) => {
    const g = GROUP_OF[r.status];
    const gm = GROUP_META[g];
    return {
      row: r,
      showGroup: i === 0 || GROUP_OF[view[i - 1].status] !== g,
      groupLabel: gm.label,
      groupCls: gm.cls,
      groupCount: groupCounts[g] ?? 0,
      tier: tierOf(r.company_name),
      age: ageInfo(r),
      dupe: isDupe(r),
      suspect: isSuspect(r),
      nx: NEXT[r.status],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [view, groupCounts, dupeKeys]);

  // Flattened so the group-header separators are their own virtual items —
  // each entry maps 1:1 to exactly one rendered <tr>, which the row
  // virtualizer below needs to window the table without breaking its layout.
  type FlatRow = { kind: "group"; label: string; cls: string; count: number } | { kind: "row"; data: RowData };
  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    for (const d of rowsData) {
      if (d.showGroup) out.push({ kind: "group", label: d.groupLabel, cls: d.groupCls, count: d.groupCount });
      out.push({ kind: "row", data: d });
    }
    return out;
  }, [rowsData]);

  // Only the rows scrolled into view (plus overscan) are mounted; two spacer
  // <tr>s stand in for the scrolled-past space above/below so the table stays
  // real <tr>/<td> markup (column alignment intact) instead of absolutely
  // positioned rows, which HTML tables don't lay out correctly.
  const mainScrollRef = useRef<HTMLElement | null>(null);
  useEffect(() => { mainScrollRef.current = document.querySelector(".main"); }, []);
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => mainScrollRef.current,
    estimateSize: (i) => (flatRows[i]?.kind === "group" ? 44 : 64),
    overscan: 10,
  });

  const openNew = useCallback(() => { setEditing(null); setModalOpen(true); }, []);
  const openEdit = useCallback((row: ApplicationRow) => { setEditing(row); setModalOpen(true); }, []);
  const onTogglePop = useCallback((id: number) => setOpenPop((p) => (p === id ? null : id)), []);
  const onClosePop = useCallback(() => setOpenPop(null), []);

  const handleDelete = useCallback(async (row: ApplicationRow) => {
    setError("");
    try {
      await deleteApplication(row.id);
      setNotice("Application deleted.");
      load(false);
    } catch (e) {
      setError(userErrorMessage(e, "Couldn't delete this application."));
    }
  }, [load]);

  const changeStatus = useCallback(async (row: ApplicationRow, next: Status) => {
    setOpenPop(null);
    if (next === row.status) return;
    setAll((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
    try {
      await setApplicationStatus(row.id, next);
      setNotice(`Moved to ${STATUS_LABELS[next]}.`);
      if (isMilestone(next)) {
        const reach = next === "rejected" ? journeyIndex(row.status) : journeyIndex(next);
        const terminal: Terminal = next === "rejected" ? "rejected" : null;
        setCelebrate({ kind: next, row: { ...row, status: next }, reach, terminal });
      }
    } catch (e) {
      setError(userErrorMessage(e, "Couldn't update application status."));
      load(false);
    }
  }, [load]);
  const advance = useCallback((row: ApplicationRow) => { const n = NEXT[row.status]; if (n) changeStatus(row, n); }, [changeStatus]);

  // Ghosting fires on its own — no one marks an application as ignored. Once per
  // session, surface the oldest applied role past the quiet line that we haven't
  // already acknowledged.
  function ghostAck(): Set<number> {
    try { return new Set(JSON.parse(localStorage.getItem(GHOST_ACK_KEY) ?? "[]")); } catch { return new Set(); }
  }
  useEffect(() => {
    if (ghostShownRef.current || celebrate || modalOpen || all.length === 0) return;
    const ack = ghostAck();
    const quiet = all
      .filter((r) => r.status === "applied" && !ack.has(r.id) && (daysSince(r.date_applied ?? r.date_saved) ?? 0) >= GHOST_DAYS)
      .sort((a, b) => (daysSince(b.date_applied ?? b.date_saved) ?? 0) - (daysSince(a.date_applied ?? a.date_saved) ?? 0));
    if (quiet.length) {
      ghostShownRef.current = true;
      setCelebrate({ kind: "ghosted", row: quiet[0], reach: 1, terminal: "ghosted" });
    }
  }, [all, celebrate, modalOpen]);

  function closeGhost(row: ApplicationRow) {
    const ack = ghostAck(); ack.add(row.id);
    try { localStorage.setItem(GHOST_ACK_KEY, JSON.stringify([...ack])); } catch { /* ignore */ }
  }

  function statsFor(c: Celebrate): [string, string][] {
    const { kind, row, reach } = c;
    const total = all.length;
    const live = all.filter((r) => r.status !== "rejected" && r.status !== "offer").length;
    const closed = all.filter((r) => r.status === "rejected").length;
    const reached = all.filter((r) => r.status === "interview" || r.status === "offer").length;
    const oaCount = all.filter((r) => r.status === "oa").length;
    const quiet = all.filter((r) => r.status === "applied" && (daysSince(r.date_applied ?? r.date_saved) ?? 0) >= GHOST_DAYS).length;
    const rate = total ? Math.round((reached / total) * 100) : 0;
    const age = daysSince(row.date_applied ?? row.date_saved ?? row.created_at);
    const ageStr = age != null ? `${age}d` : "—";
    const firstAges = all.map((r) => daysSince(r.date_applied)).filter((x): x is number => x != null);
    const firstAge = firstAges.length ? Math.max(...firstAges) : null;
    const resume = row.resume_version_name ?? "—";
    if (kind === "applied") return [[String(total), "applications"], [String(live), "still live"], [resume, "résumé attached"]];
    if (kind === "oa") return [[String(Math.max(oaCount, 1)), "OAs in flight"], [ageStr, "since you applied"], [String(live), "apps still live"]];
    if (kind === "interview") return [[`1 of ${total}`, "applications"], [`${rate}%`, "reach interview+"], [String(live), "still live"]];
    if (kind === "offer") return [[String(total), "applications"], [firstAge != null ? `${firstAge}d` : "—", "first app → offer"], [resume, "résumé that did it"]];
    if (kind === "ghosted") return [[ageStr, "since you applied"], [String(quiet), "gone quiet"], [String(live), "still live"]];
    return [[String(closed), "closed"], [String(live), "still live"], [JOURNEY_LABELS[reach] ?? "—", "stage it ended"]];
  }

  function dismissCelebrate() {
    if (celebrate?.kind === "ghosted") closeGhost(celebrate.row);
    setCelebrate(null); load();
  }
  function onMilestonePrimary() {
    if (!celebrate) return;
    const { kind, row } = celebrate;
    dismissCelebrate();
    if (kind === "oa") navigate("/oa");
    else if (kind === "applied") navigate("/toolkit");
    else if (kind === "interview" || kind === "ghosted") navigate("/networking");
    else if (kind === "offer") openEdit(row);
    else navigate("/");
  }
  async function onGhostClosed() {
    if (!celebrate) return;
    const row = celebrate.row;
    closeGhost(row);
    try { await setApplicationStatus(row.id, "rejected"); }
    catch (e) { setError(userErrorMessage(e, "Couldn't close this application.")); }
    setCelebrate(null); load(false);
  }

  const chips: (Status | "all")[] = ["all", ...STATUSES];

  return (
    <div className="apps">
      <div className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Every company, role, and status in one place.</p>
        </div>
        <button onClick={openNew}>+ New application</button>
      </div>

      <div className="filters">
        <label className="search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input placeholder="Search company, role, or location…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {chips.map((c) => {
          const n = c === "all" ? all.length : counts[c] ?? 0;
          if (c !== "all" && n === 0) return null;
          return (
            <button
              key={c}
              className={`fchip ${filter === c ? "on" : ""}`}
              style={c === "all" ? undefined : ({ "--c": `var(${STAGE_VAR[c]})` } as React.CSSProperties)}
              onClick={() => setFilter(c)}
            >
              {c !== "all" && <i />}
              {c === "all" ? "All" : STATUS_LABELS[c]} <b>{n}</b>
            </button>
          );
        })}
      </div>
      {error && all.length > 0 && <PageNotice kind="error">{error}</PageNotice>}
      {notice && <PageNotice kind="success">{notice}</PageNotice>}

      {loading && all.length === 0 ? (
        <LoadingState title="Loading applications" detail="Pulling your tracker into view." />
      ) : error && all.length === 0 ? (
        <ErrorState
          title="Couldn't load applications"
          detail={error}
          action={<button type="button" onClick={() => load()}>Retry</button>}
        />
      ) : view.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            title="Track your first application"
            detail="Save a role once you apply or want to follow up. InternPilot will keep the stage, resume, notes, and next actions together."
            action={<button type="button" onClick={openNew}>Add application</button>}
          />
        ) : (
          <EmptyState
            title="No applications match this view"
            detail="Try another status filter or clear the search to get back to your full pipeline."
            action={<button type="button" className="secondary" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button>}
          />
        )
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th style={{ width: 250 }}>Status</th>
                <th className="hidesm" style={{ width: 160 }}>Résumé</th>
                <th className="age" style={{ width: 108 }}>Age</th>
                <th style={{ width: 76 }}></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const items = rowVirtualizer.getVirtualItems();
                const paddingTop = items.length ? items[0].start : 0;
                const paddingBottom = items.length ? rowVirtualizer.getTotalSize() - items[items.length - 1].end : 0;
                return (
                  <>
                    {paddingTop > 0 && <tr><td colSpan={6} style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>}
                    {items.map((vi) => {
                      const item = flatRows[vi.index];
                      if (!item) return null;
                      if (item.kind === "group") {
                        return <GroupHeaderRow key={`g-${vi.index}`} ref={rowVirtualizer.measureElement} data-index={vi.index} label={item.label} cls={item.cls} count={item.count} />;
                      }
                      return (
                        <AppRow
                          key={item.data.row.id}
                          ref={rowVirtualizer.measureElement}
                          data-index={vi.index}
                          data={item.data}
                          isPopOpen={openPop === item.data.row.id}
                          onTogglePop={onTogglePop}
                          onClosePop={onClosePop}
                          onChangeStatus={changeStatus}
                          onAdvance={advance}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                        />
                      );
                    })}
                    {paddingBottom > 0 && <tr><td colSpan={6} style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>}
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ApplicationModal
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); setNotice(editing ? "Application updated." : "Application saved."); load(false); }}
        />
      )}

      {celebrate && (
        <MilestoneCelebration
          kind={celebrate.kind}
          company={celebrate.row.company_name ?? "This company"}
          role={celebrate.row.role_title}
          stats={statsFor(celebrate)}
          reach={celebrate.reach}
          terminal={celebrate.terminal}
          onClose={dismissCelebrate}
          onPrimary={onMilestonePrimary}
          onSecondary={celebrate.kind === "ghosted" ? onGhostClosed : undefined}
        />
      )}
    </div>
  );
}
