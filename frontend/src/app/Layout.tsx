import { NavLink, Outlet } from "react-router-dom";
import { usePlanRun } from "./planRun";

const LINKS = [
  { to: "/home", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/train", label: "Train" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/coach", label: "Coach" },
  { to: "/data", label: "My data" },
];

export default function Layout() {
  const { index, steps } = usePlanRun();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <NavLink to="/home" className="shrink-0 text-lg font-bold text-brand">
            AI4Brain <span className="font-normal text-slate-500">Rami</span>
          </NavLink>
          <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium sm:text-base ${
                    isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-brand-light"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {index >= 0 && (
          <div className="bg-brand-light px-4 py-2 text-center text-sm text-brand-dark">
            Today's plan: step {index + 1} of {steps.length}
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="px-4 py-6 text-center text-xs text-slate-500">
        A game for training thinking skills. It is not a medical test.
      </footer>
    </div>
  );
}
