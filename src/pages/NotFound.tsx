import { useNavigate } from "react-router-dom";
import DesktopPromo from "../components/DesktopPromo";

/** Catch-all for unknown routes — points web users to the desktop app + home. */
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div>
      <DesktopPromo
        title="We couldn't find that page"
        blurb="It may not exist, or it's a feature that lives in the InternPilot desktop app — the autofill browser extension, Gmail sync, and AI with your own key. Grab the app for the full experience, or head back."
      />
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button type="button" className="btn" onClick={() => navigate("/")}>← Back to InternPilot</button>
      </div>
    </div>
  );
}
