import { useState, useCallback, useEffect } from "react";
import type { DashboardPage } from "../../types.ts";
import { GoalsPage } from "./GoalsPage.tsx";
import { ResearchPage } from "./ResearchPage.tsx";
import { MilestonesPage } from "./MilestonesPage.tsx";
import { IssuesPage } from "./IssuesPage.tsx";

interface DashboardViewProps {
  token: string;
  visible: boolean;
}

export function DashboardView({ token, visible }: DashboardViewProps) {
  const [activePage, setActivePage] = useState<DashboardPage>(() => {
    const saved = localStorage.getItem("copilot_dashboard_page");
    if (
      saved &&
      ["goals", "research", "milestones", "issues"].includes(saved)
    ) {
      return saved as DashboardPage;
    }
    return "goals";
  });

  const navigateTo = useCallback((page: DashboardPage) => {
    setActivePage(page);
    localStorage.setItem("copilot_dashboard_page", page);
  }, []);

  // Restore dashboard page from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("copilot_dashboard_page");
    if (
      saved &&
      ["goals", "research", "milestones", "issues"].includes(saved)
    ) {
      setActivePage(saved as DashboardPage);
    }
  }, []);

  const navItems: { page: DashboardPage; icon: string; label: string }[] =
    [
      { page: "goals", icon: "🎯", label: "Goals" },
      { page: "research", icon: "🔬", label: "Research" },
      { page: "milestones", icon: "🏁", label: "Milestones" },
      { page: "issues", icon: "📋", label: "Issues" },
    ];

  return (
    <div id="dashboard-view" className={visible ? "active" : ""}>
      <nav id="dashboard-nav">
        <div id="dashboard-nav-header">
          <strong>Planning Dashboard</strong>
        </div>
        {navItems.map((item) => (
          <button
            key={item.page}
            className={`dashboard-nav-item${activePage === item.page ? " active" : ""}`}
            data-page={item.page}
            onClick={() => navigateTo(item.page)}
          >
            <span className="dashboard-nav-icon">{item.icon}</span>
            <span className="dashboard-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div id="dashboard-content">
        <div
          className={`dashboard-page${activePage === "goals" ? " active" : ""}`}
          id="dashboard-page-goals"
        >
          <GoalsPage token={token} active={activePage === "goals"} />
        </div>
        <div
          className={`dashboard-page${activePage === "research" ? " active" : ""}`}
          id="dashboard-page-research"
        >
          <ResearchPage
            token={token}
            active={activePage === "research"}
          />
        </div>
        <div
          className={`dashboard-page${activePage === "milestones" ? " active" : ""}`}
          id="dashboard-page-milestones"
        >
          <MilestonesPage
            token={token}
            active={activePage === "milestones"}
          />
        </div>
        <div
          className={`dashboard-page${activePage === "issues" ? " active" : ""}`}
          id="dashboard-page-issues"
        >
          <IssuesPage
            token={token}
            active={activePage === "issues"}
          />
        </div>
      </div>
    </div>
  );
}
