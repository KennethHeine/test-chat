import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../utils/api.ts";
import type { Goal } from "../../types.ts";

interface GoalsPageProps {
  token: string;
  active: boolean;
}

interface GoalCounts {
  research: number;
  milestones: number;
  issues: number;
}

export function GoalsPage({ active }: GoalsPageProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalCounts, setGoalCounts] = useState<Record<string, GoalCounts>>({});
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [selectedGoalCounts, setSelectedGoalCounts] = useState<GoalCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadGoals = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/goals");
      if (!res.ok) return;
      const data = await res.json();
      const items: Goal[] = data.goals || [];
      items.sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime(),
      );
      setGoals(items);

      // Fetch counts for each goal
      const counts: Record<string, GoalCounts> = {};
      await Promise.all(
        items.map(async (g) => {
          counts[g.id] = await fetchGoalCounts(g.id);
        }),
      );
      setGoalCounts(counts);
    } catch (err) {
      console.warn("Failed to load goals:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) loadGoals();
  }, [active, loadGoals]);

  const showDetail = useCallback(
    async (goalId: string) => {
      const goal = goals.find((g) => g.id === goalId);
      if (goal) {
        setSelectedGoalId(goalId);
        setSelectedGoal(goal);
        setSelectedGoalCounts(goalCounts[goalId] || null);
      }
    },
    [goals, goalCounts],
  );

  const showList = useCallback(() => {
    setSelectedGoalId(null);
    setSelectedGoal(null);
    setSelectedGoalCounts(null);
  }, []);

  if (selectedGoalId && selectedGoal) {
    return (
      <>
        <div id="goals-list-view" style={{ display: "none" }} />
        <div id="goals-detail-view">
          <button className="goal-detail-back btn" onClick={showList}>
            ← Back to Goals
          </button>
          <div className="goal-detail">
            <h3 className="goal-detail-title">{selectedGoal.goal || "Goal"}</h3>
            {selectedGoal.intent && (
              <div className="goal-detail-field goal-detail-intent">
                <span className="goal-detail-label">Intent:</span>{" "}
                {selectedGoal.intent}
              </div>
            )}
            {selectedGoal.problemStatement && (
              <div className="goal-detail-field">
                <span className="goal-detail-label">Problem:</span>{" "}
                {selectedGoal.problemStatement}
              </div>
            )}
            {selectedGoal.businessValue && (
              <div className="goal-detail-field">
                <span className="goal-detail-label">Business Value:</span>{" "}
                {selectedGoal.businessValue}
              </div>
            )}
            {selectedGoal.targetOutcome && (
              <div className="goal-detail-field">
                <span className="goal-detail-label">Target Outcome:</span>{" "}
                {selectedGoal.targetOutcome}
              </div>
            )}
            {selectedGoal.successCriteria &&
              selectedGoal.successCriteria.length > 0 && (
                <div className="goal-detail-field">
                  <span className="goal-detail-label">
                    Success Criteria:
                  </span>
                  <ul>
                    {selectedGoal.successCriteria.map((c, i) => (
                      <li key={i}>✓ {c}</li>
                    ))}
                  </ul>
                </div>
              )}
            {selectedGoalCounts && (
              <div className="goal-detail-counts">
                <div className="goal-detail-count-badge">
                  <span className="count-number">{selectedGoalCounts.research}</span>
                  <span className="count-label">Research</span>
                </div>
                <div className="goal-detail-count-badge">
                  <span className="count-number">{selectedGoalCounts.milestones}</span>
                  <span className="count-label">Milestones</span>
                </div>
                <div className="goal-detail-count-badge">
                  <span className="count-number">{selectedGoalCounts.issues}</span>
                  <span className="count-label">Issues</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div id="goals-list-view">
        <div className="dashboard-page-header">
          <h3>Goals</h3>
        </div>
        <div id="goals-list-content">
          {isLoading ? (
            <div className="dashboard-loading">Loading goals...</div>
          ) : goals.length === 0 ? (
            <div className="dashboard-empty">
              <span className="dashboard-empty-icon">🎯</span>
              <p>No goals defined yet.</p>
              <p>Use the chat to define a goal for your project.</p>
            </div>
          ) : (
            goals.map((goal) => (
              <div
                key={goal.id}
                className="goal-list-item"
                role="button"
                tabIndex={0}
                onClick={() => showDetail(goal.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    showDetail(goal.id);
                  }
                }}
              >
                <div className="goal-card-header">
                  <span>🎯 Goal</span>
                </div>
                <div className="goal-card-body">
                  <div className="goal-list-item-title">
                    {goal.goal || "Untitled"}
                  </div>
                  {goal.problemStatement && (
                    <div className="goal-card-field">
                      <span className="goal-card-label">Problem:</span>
                      <span className="goal-card-value">
                        {goal.problemStatement}
                      </span>
                    </div>
                  )}
                  {goal.businessValue && (
                    <div className="goal-card-field">
                      <span className="goal-card-label">
                        Business Value:
                      </span>
                      <span className="goal-card-value">
                        {goal.businessValue}
                      </span>
                    </div>
                  )}
                  {goalCounts[goal.id] && (
                    <div className="goal-list-item-counts">
                      {goalCounts[goal.id].research} research · {goalCounts[goal.id].milestones} milestones · {goalCounts[goal.id].issues} issues
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div id="goals-detail-view" className="hidden" style={{ display: "none" }} />
    </>
  );
}

async function fetchGoalCounts(goalId: string): Promise<GoalCounts> {
  let research = 0;
  let milestones = 0;
  let issues = 0;
  try {
    const [researchRes, milestonesRes] = await Promise.all([
      apiFetch(`/api/goals/${encodeURIComponent(goalId)}/research`),
      apiFetch(`/api/goals/${encodeURIComponent(goalId)}/milestones`),
    ]);
    if (researchRes.ok) {
      const d = await researchRes.json();
      research = (d.items || d.research || []).length;
    }
    if (milestonesRes.ok) {
      const d = await milestonesRes.json();
      const ms = d.milestones || [];
      milestones = ms.length;
      // Fetch issue counts for each milestone
      const issueCounts = await Promise.all(
        ms.map(async (m: { id: string }) => {
          const r = await apiFetch(
            `/api/milestones/${encodeURIComponent(m.id)}/issues`,
          );
          if (r.ok) {
            const dd = await r.json();
            return (dd.issues || []).length;
          }
          return 0;
        }),
      );
      issues = issueCounts.reduce((a, b) => a + b, 0);
    }
  } catch {
    // ignore
  }
  return { research, milestones, issues };
}
