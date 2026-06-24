import { useEffect, useState } from "react";
import { deleteResumeBullet, listResumeBullets } from "../db/resumes";
import type { ResumeBullet } from "../db/types";

export default function Bullets() {
  const [bullets, setBullets] = useState<ResumeBullet[]>([]);

  function load() {
    listResumeBullets().then(setBullets).catch(console.error);
  }
  useEffect(load, []);

  async function remove(id: number) {
    if (!confirm("Delete this saved bullet?")) return;
    await deleteResumeBullet(id);
    load();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bullet Library</h1>
          <p>Improved resume bullets you've saved from AI matches.</p>
        </div>
      </div>

      {bullets.length === 0 ? (
        <div className="empty">
          No saved bullets yet. Run an AI match in <strong>Resume Center</strong> and click
          "Save to library" on a suggestion.
        </div>
      ) : (
        bullets.map((b) => (
          <div className="card" key={b.id}>
            <div className="row-between">
              <span className="label text-dim">{b.created_at?.slice(0, 10)}</span>
              {b.tags && <span className={`badge ${b.tags === "openai" ? "offer" : "interested"}`}>{b.tags}</span>}
            </div>
            {b.original_text && <div className="muted text-sm mt-xs">Before: {b.original_text}</div>}
            <div className="mt-xs">After: {b.improved_text}</div>
            <div className="actions mt-sm">
              <button type="button" className="secondary small" onClick={() => copy(b.improved_text ?? "")}>Copy</button>
              <button type="button" className="danger small" onClick={() => remove(b.id)}>Delete</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
