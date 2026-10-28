import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { IconLogout, Logo } from "./components/ui";
import { api } from "./lib/api";
import { LeaveGuardProvider, useLeaveGuard } from "./lib/leaveGuard";
import type { Workspace } from "./lib/types";

export function AppShell() {
  return (
    <LeaveGuardProvider>
      <AppShellInner />
    </LeaveGuardProvider>
  );
}

function AppShellInner() {
  const navigate = useNavigate();
  const { tryLeave } = useLeaveGuard();

  async function logout() {
    await api.logout();
    navigate("/login");
  }

  return (
    <div className="vyaz-shell">
      <header className="vyaz-header">
        <a href="#vyaz-main" className="vyaz-skip">
          К содержимому
        </a>
        <a
          className="vyaz-header__brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            tryLeave(() => navigate("/"));
          }}
        >
          <Logo />
          <span>Вязь</span>
        </a>
        <div className="vyaz-header__actions">
          <button type="button" className="vyaz-icon-btn" aria-label="Выйти" onClick={() => void logout()}>
            <IconLogout />
          </button>
        </div>
      </header>
      <div className="vyaz-shell__body">
        <div className="vyaz-main" id="vyaz-main" tabIndex={-1}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function HomeRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    api
      .workspaces()
      .then((workspaces) => {
        const list = workspaces as Workspace[];
        if (list[0]) {
          navigate(`/w/${list[0].id}`, { replace: true });
        } else {
          navigate("/login", { replace: true });
        }
      })
      .catch(() => navigate("/login", { replace: true }));
  }, [navigate]);
  return (
    <p className="vyaz-muted" style={{ padding: "1.5rem" }}>
      Открываю рабочее пространство…
    </p>
  );
}
