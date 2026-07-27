import { useEffect, useState } from "react";
import { isOnboarded } from "../db/profile";
import ProfileForm from "./ProfileForm";

/** First-run questionnaire. Shows until the profile is saved once. */
export default function Onboarding() {
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    isOnboarded()
      .then((o) => setShow(!o))
      .catch(() => setShow(false))
      .finally(() => setChecked(true));
  }, []);

  if (!checked || !show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Welcome to InternPilot 👋</h2>
        <p className="hint mb-md">
          Answer a few quick questions so we can tailor internship recommendations, metrics, and prefilled
          applications to you. You can change these anytime in Profile.
        </p>
        <ProfileForm submitLabel="Get started" onSaved={() => setShow(false)} />
      </div>
    </div>
  );
}
