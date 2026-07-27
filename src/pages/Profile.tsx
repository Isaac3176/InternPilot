import ProfileForm from "../components/ProfileForm";

export default function Profile() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Used to tailor the internship feed, metrics, and prefilled applications.</p>
        </div>
      </div>
      <div className="card">
        <ProfileForm />
      </div>
    </>
  );
}
