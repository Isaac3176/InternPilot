import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import Applications from "./pages/Applications";
import ResumeCenter from "./pages/ResumeCenter";
import Bullets from "./pages/Bullets";
import InterviewPrep from "./pages/InterviewPrep";
import AIChat from "./pages/AIChat";
import Settings from "./pages/Settings";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "applications", element: <Applications /> },
      { path: "resumes", element: <ResumeCenter /> },
      { path: "bullets", element: <Bullets /> },
      { path: "prep", element: <InterviewPrep /> },
      { path: "chat", element: <AIChat /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
