import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import AuthGate from "./components/AuthGate";
import "./App.css";
import Queue from "./pages/Queue";
import Watchlist from "./pages/Watchlist";
import Dashboard from "./pages/Dashboard";
import Applications from "./pages/Applications";
import Internships from "./pages/Internships";
import ResumeCenter from "./pages/ResumeCenter";
import Bullets from "./pages/Bullets";
import Networking from "./pages/Networking";
import InterviewPrep from "./pages/InterviewPrep";
import Experiences from "./pages/Experiences";
import ApplyAssist from "./pages/ApplyAssist";
import Emails from "./pages/Emails";
import Profile from "./pages/Profile";
import AIChat from "./pages/AIChat";
import Settings from "./pages/Settings";

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
