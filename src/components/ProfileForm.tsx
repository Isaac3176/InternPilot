import { PROFILE_SECTIONS, useProfileForm } from "./useProfileForm";

interface Props {
  submitLabel?: string;
  onSaved?: () => void;
}

export default function ProfileForm({ submitLabel = "Save profile", onSaved }: Props) {
  const h = useProfileForm(onSaved);

  return (
    <>
      {PROFILE_SECTIONS.map((section) => (
        <div className="form-section" key={section.title}>
          <h3 className="form-section-title">{section.title}</h3>
          {section.render(h)}
        </div>
      ))}
      <button type="button" onClick={h.save} disabled={h.saving}>
        {h.saving ? "Saving…" : h.savedMsg ? "Saved ✓" : submitLabel}
      </button>
    </>
  );
}
