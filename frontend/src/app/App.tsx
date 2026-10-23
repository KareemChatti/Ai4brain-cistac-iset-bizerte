import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { createUser } from "@/api/client";
import { useApp } from "./store";
import Layout from "./Layout";
import HomePage from "./pages/HomePage";
import PlayPage from "./pages/PlayPage";
import TrainPage, { TrainIndex } from "./pages/TrainPage";
import WelcomePage from "@/onboarding/WelcomePage";
import DataPage from "@/onboarding/DataPage";
import ReviewPage from "@/coach/ReviewPage";
import ChatPage from "@/coach/ChatPage";
import DashboardPage from "@/dashboard/DashboardPage";

/** Creates the user once (POST /api/users) and keeps the id in localStorage. */
function useEnsureUser() {
  const { userId, setUserId } = useApp();
  useEffect(() => {
    if (userId) return;
    createUser("player").then((r) => setUserId(r.user_id), console.error);
  }, [userId, setUserId]);
  return userId;
}

/** Everything except /welcome needs consent first. */
function RequireConsent({ children }: { children: JSX.Element }) {
  const consent = useApp((s) => s.consentVersion);
  const location = useLocation();
  if (!consent) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  const userId = useEnsureUser();
  if (!userId) return <p className="p-6 text-slate-500">Getting things ready…</p>;

  const guard = (el: JSX.Element) => <RequireConsent>{el}</RequireConsent>;
  return (
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route element={<Layout />}>
        <Route path="/home" element={guard(<HomePage />)} />
        <Route path="/play" element={guard(<PlayPage />)} />
        <Route path="/train" element={guard(<TrainIndex />)} />
        <Route path="/train/:gameId" element={guard(<TrainPage />)} />
        <Route path="/review/:roundId" element={guard(<ReviewPage />)} />
        <Route path="/dashboard" element={guard(<DashboardPage />)} />
        <Route path="/coach" element={guard(<ChatPage />)} />
        <Route path="/data" element={guard(<DataPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
