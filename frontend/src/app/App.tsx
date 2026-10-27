import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./store";
import Layout from "./Layout";
import HomePage from "./pages/HomePage";
import PlayPage from "./pages/PlayPage";
import RulesPage from "./pages/RulesPage";
import WelcomePage from "@/onboarding/WelcomePage";
import DataPage from "@/onboarding/DataPage";
import ReviewPage from "@/coach/ReviewPage";
import ChatPage from "@/coach/ChatPage";
import DashboardPage from "@/dashboard/DashboardPage";

/** Everything except /welcome needs a user (created on the welcome page with a nickname) and consent. */
function RequireConsent({ children }: { children: JSX.Element }) {
  const consent = useApp((s) => s.consentVersion);
  const userId = useApp((s) => s.userId);
  const location = useLocation();
  if (!consent || !userId) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {

  const guard = (el: JSX.Element) => <RequireConsent>{el}</RequireConsent>;
  return (
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route element={<Layout />}>
        <Route path="/home" element={guard(<HomePage />)} />
        <Route path="/play" element={guard(<PlayPage />)} />
        <Route path="/rules" element={guard(<RulesPage />)} />
        <Route path="/review/:roundId" element={guard(<ReviewPage />)} />
        <Route path="/dashboard" element={guard(<DashboardPage />)} />
        <Route path="/coach" element={guard(<ChatPage />)} />
        <Route path="/data" element={guard(<DataPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
