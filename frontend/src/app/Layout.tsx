import { NavLink, Outlet } from "react-router-dom";
import { usePlanRun } from "./planRun";

const LINKS = [
  { to: "/home", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/rules", label: "Rules" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/coach", label: "Coach" },
  { to: "/data", label: "My data" },
];

export default function Layout() {
  const { index, steps } = usePlanRun();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[var(--z-sticky-nav)] bg-paper/95 shadow-[0_1px_0_var(--color-rule)] backdrop-blur">
        <div className="mx-auto flex max-w-app items-center gap-3 px-4 py-2 sm:gap-6 sm:px-6">
          <NavLink to="/home" aria-label="AI4Brain Rami, home" className="shrink-0 font-display text-lg font-semibold text-ink no-underline">
            AI4Brain <span className="font-medium text-muted">Rami</span>
          </NavLink>
          <nav className="scroll-row -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-1" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `inline-flex min-h-[40px] items-center whitespace-nowrap rounded-full px-3 text-[0.9375rem] font-medium no-underline transition-colors duration-100 ${
                    isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2 active:bg-paper-3"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {index >= 0 && (
          <p className="bg-accent px-4 py-2 text-center text-sm font-medium text-accent-ink" role="status">
            Today’s plan: step {index + 1} of {steps.length}
          </p>
        )}
      </header>
      <main className="mx-auto w-full max-w-app flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-app px-4 py-8 text-sm text-muted sm:px-6">
        A game for training thinking skills. It is not a medical test.
      </footer>
    </div>
  );
}
