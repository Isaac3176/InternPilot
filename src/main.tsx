import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import AuthGate from "./components/AuthGate";
import "./App.css";

// Pages are code-split so the initial boot only loads what the first route needs.
const Queue = lazy(() => import("./pages/Queue"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const ReleaseRadar = lazy(() => import("./pages/ReleaseRadar"));
const Packet = lazy(() => import("./pages/Packet"));
const AnswerVault = lazy(() => import("./pages/AnswerVault"));
const ResumeLab = lazy(() => import("./pages/ResumeLab"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Applications = lazy(() => import("./pages/Applications"));
const Internships = lazy(() => import("./pages/Internships"));
const ResumeCenter = lazy(() => import("./pages/ResumeCenter"));
const Bullets = lazy(() => import("./pages/Bullets"));
const Networking = lazy(() => import("./pages/Networking"));
const InterviewPrep = lazy(() => import("./pages/InterviewPrep"));
const Experiences = lazy(() => import("./pages/Experiences"));
const ApplyAssist = lazy(() => import("./pages/ApplyAssist"));
const Emails = lazy(() => import("./pages/Emails"));
const Profile = lazy(() => import("./pages/Profile"));
const AIChat = lazy(() => import("./pages/AIChat"));
const Settings = lazy(() => import("./pages/Settings"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Queue /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "applications", element: <Applications /> },
      { path: "internships", element: <Internships /> },
      { path: "watchlist", element: <Watchlist /> },
      { path: "radar", element: <ReleaseRadar /> },
      { path: "packet", element: <Packet /> },
      { path: "answers", element: <AnswerVault /> },
      { path: "resume-lab", element: <ResumeLab /> },
      { path: "resumes", element: <ResumeCenter /> },
      { path: "bullets", element: <Bullets /> },
      { path: "networking", element: <Networking /> },
      { path: "prep", element: <InterviewPrep /> },
      { path: "experiences", element: <Experiences /> },
      { path: "apply", element: <ApplyAssist /> },
      { path: "emails", element: <Emails /> },
      { path: "profile", element: <Profile /> },
      { path: "chat", element: <AIChat /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  </React.StrictMode>,
);
