import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../utils/api.ts";
import type { Goal, Milestone } from "../../types.ts";
import { VALID_MILESTONE_STATUSES, DEFAULT_MILESTONE_STATUS } from "../../types.ts";

interface MilestonesPageProps {
  token: string;
  active: boolean;
}

export function MilestonesPage({ active }: MilestonesPageProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);

  const loadGoals = useCallback(async () => {
    try {
      const res = await apiFetch("/api/goals");
      if (!res.ok) return;
      const data = await res.json();
      const items: Goal[] = data.goals || [];
      setGoals(items);
      if (items.length > 0 && !selectedGoalId) {
        setSelectedGoalId(items[0].id);
      }
    } catch (err) {
      console.warn("Failed to load goals:", err);
    }
  }, [selectedGoalId]);

  const loadMilestones = useCallback(async (goalId: string) => {
    if (!goalId) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(
        `/api/goals/${encodeURIComponent(goalId)}/milestones`,
      );
      if (!res.ok) {
        setMilestones([]);
        return;
      }
      const data = await res.json();
      const ms: Milestone[] = data.milestones || [];
      ms.sort((a, b) => (a.order || 0) - (b.order || 0));
      setMilestones(ms);

      // Fetch issue counts
      const counts: Record<string, number> = {};
      await Promise.all(
        ms.map(async (m) => {
          try {
            const r = await apiFetch(
              `/api/milestones/${encodeURIComponent(m.id)}/issues`,
            );
            if (r.ok) {
              const d = await r.json();
              counts[m.id] = (d.issues || []).length;
            }
          } catch {
            counts[m.id] = 0;
          }
        }),
      );
      setIssueCounts(counts);
    } catch (err) {
      console.warn("Failed to load milestones:", err);
      setMilestones([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) loadGoals();
  }, [active, loadGoals]);

  useEffect(() => {
    if (selectedGoalId) loadMilestones(selectedGoalId);
  }, [selectedGoalId, loadMilestones]);

  // Build id-to-order map for dependency display
  const idToOrder = new Map<string, number>();
  for (const ms of milestones) {
    if (ms.id) idToOrder.set(ms.id, ms.order);
  }

  // Summary counts
  const total = milestones.length;
  const complete = milestones.filter((m) => m.status === "complete").length;
  const inProgress = milestones.filter((m) => m.status === "in-progress").length;
  const ready = milestones.filter((m) => m.status === "ready").length;
  const draft = total - complete - inProgress - ready;
  const summaryParts: string[] = [];
  if (draft > 0) summaryParts.push(`Draft: ${draft}`);
  if (ready > 0) summaryParts.push(`Ready: ${ready}`);
  if (inProgress > 0) summaryParts.push(`In Progress: ${inProgress}`);
  if (complete > 0) summaryParts.push(`Complete: ${complete}`);

  return (
    <>
      <div className="dashboard-page-header">
        <h3>Milestones</h3>
      </div>
      <div
        id="milestone-goal-selector"
        style={{ display: goals.length > 1 ? "block" : "none" }}
      >
        <select
          id="milestone-goal-select"
          className="milestone-goal-select"
          aria-label="Select goal to view milestones for"
          value={selectedGoalId}
          onChange={(e) => setSelectedGoalId(e.target.value)}
        >
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.goal || "Untitled Goal"}
            </option>
          ))}
        </select>
      </div>
      <div id="milestone-page-content">
        {isLoading ? (
          <div className="dashboard-loading">
            Loading milestones...
          </div>
        ) : milestones.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon">🏁</span>
            <p>No milestones yet.</p>
            <p>
              Ask the agent to create a milestone plan for your goal.
            </p>
          </div>
        ) : (
          <>
            {milestones.map((ms) => {
              const rawStatus = ms.status || DEFAULT_MILESTONE_STATUS;
              const status = VALID_MILESTONE_STATUSES.includes(rawStatus)
                ? rawStatus
                : DEFAULT_MILESTONE_STATUS;
              const count = issueCounts[ms.id] ?? 0;
              return (
                <div
                  key={ms.id}
                  className="milestone-timeline-item"
                  data-milestone-id={ms.id}
                >
                  <div className="milestone-timeline-header">
                    <span className="milestone-timeline-order milestone-order">
                      #{ms.order}
                    </span>
                    <span className="milestone-timeline-name milestone-name">
                      {ms.name}
                    </span>
                    <span
                      className={`milestone-timeline-status milestone-status status-${status}`}
                    >
                      {status}
                    </span>
                  </div>
                  {ms.goal && (
                    <div className="milestone-timeline-goal milestone-timeline-summary">
                      {ms.goal}
                    </div>
                  )}
                  {ms.acceptanceCriteria &&
                    ms.acceptanceCriteria.length > 0 && (
                      <div className="milestone-acceptance">
                        <strong>Acceptance:</strong>{" "}
                        {ms.acceptanceCriteria.join("; ")}
                      </div>
                    )}
                  {Array.isArray(ms.dependencies) &&
                    ms.dependencies.length > 0 && (
                      <div className="milestone-timeline-deps milestone-deps">
                        <span className="milestone-deps-label">
                          Depends on:
                        </span>{" "}
                        {ms.dependencies.map((depId, i) => {
                          const depOrder = idToOrder.get(depId);
                          const label =
                            depOrder !== undefined ? `#${depOrder}` : depId;
                          return (
                            <span key={i} className="milestone-timeline-dep-tag">
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  {ms.githubUrl && (
                    <div className="milestone-github-link">
                      <a
                        href={ms.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GitHub Milestone #{ms.githubNumber}
                      </a>
                    </div>
                  )}
                  <div className="milestone-timeline-issue-count">
                    {count} {count === 1 ? "issue" : "issues"}
                  </div>
                </div>
              );
            })}
            {summaryParts.length > 0 && (
              <div className="milestone-timeline-summary milestone-page-summary">
                {summaryParts.join(" · ")}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
