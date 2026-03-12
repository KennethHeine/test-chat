import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../utils/api.ts";
import type { Goal, Milestone, IssueDraft } from "../../types.ts";
import {
  VALID_ISSUE_DRAFT_STATUSES,
  DEFAULT_ISSUE_DRAFT_STATUS,
} from "../../types.ts";
import { PushModal } from "./PushModal.tsx";

interface IssuesPageProps {
  token: string;
  active: boolean;
}

export function IssuesPage({ token, active }: IssuesPageProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] =
    useState<string>("");
  const [issues, setIssues] = useState<IssueDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);

  const loadGoals = useCallback(async () => {
    if (!token) return;
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
  }, [token, selectedGoalId]);

  const loadMilestones = useCallback(async (goalId: string) => {
    if (!goalId) return;
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
      if (ms.length > 0) {
        setSelectedMilestoneId(ms[0].id);
      }
    } catch (err) {
      console.warn("Failed to load milestones:", err);
      setMilestones([]);
    }
  }, []);

  const loadIssues = useCallback(async (milestoneId: string) => {
    if (!milestoneId) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(
        `/api/milestones/${encodeURIComponent(milestoneId)}/issues`,
      );
      if (!res.ok) {
        setIssues([]);
        return;
      }
      const data = await res.json();
      const items: IssueDraft[] = data.issues || [];
      items.sort((a, b) => (a.order || 0) - (b.order || 0));
      setIssues(items);
    } catch (err) {
      console.warn("Failed to load issues:", err);
      setIssues([]);
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

  useEffect(() => {
    if (selectedMilestoneId) loadIssues(selectedMilestoneId);
  }, [selectedMilestoneId, loadIssues]);

  const hasReadyIssues = issues.some((i) => i.status === "ready");

  // Build order map for current milestone's issues
  const idToOrder = new Map<string, number>();
  for (const issue of issues) {
    if (issue.id) idToOrder.set(issue.id, issue.order);
  }

  return (
    <>
      <div className="dashboard-page-header">
        <h3>Issues</h3>
        <div className="dashboard-page-header-actions">
          <button
            id="push-to-github-btn"
            className="push-to-github-btn"
            style={{ display: hasReadyIssues ? "inline-flex" : "none" }}
            aria-label="Push ready issues to GitHub"
            onClick={() => setShowPushModal(true)}
          >
            🚀 Push to GitHub
          </button>
        </div>
      </div>
      <div
        id="issue-goal-selector"
        style={{ display: goals.length > 1 ? "block" : "none" }}
      >
        <select
          id="issue-goal-select"
          className="issue-goal-select"
          aria-label="Select goal to view issues for"
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
      <div
        id="issue-milestone-selector"
        style={{
          display: milestones.length > 0 ? "block" : "none",
        }}
      >
        <select
          id="issue-milestone-select"
          className="issue-milestone-select"
          aria-label="Select milestone to view issues for"
          value={selectedMilestoneId}
          onChange={(e) => setSelectedMilestoneId(e.target.value)}
        >
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              #{m.order} — {m.name}
            </option>
          ))}
        </select>
      </div>
      <div id="issue-page-content">
        {isLoading ? (
          <div className="dashboard-loading">Loading issues...</div>
        ) : issues.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon">📋</span>
            <p>No issue drafts yet.</p>
            <p>
              Ask the agent to generate issue drafts for a milestone.
            </p>
          </div>
        ) : (
          issues.map((draft) => {
            const rawStatus = draft.status || DEFAULT_ISSUE_DRAFT_STATUS;
            const status = VALID_ISSUE_DRAFT_STATUSES.includes(
              rawStatus,
            )
              ? rawStatus
              : DEFAULT_ISSUE_DRAFT_STATUS;
            return (
              <div
                key={draft.id}
                className="issue-draft-item"
                data-issue-id={draft.id}
              >
                <div className="issue-draft-header">
                  <span className="issue-draft-order">
                    #{draft.order}
                  </span>
                  <span className="issue-draft-title">
                    {draft.title}
                  </span>
                  <span
                    className={`issue-draft-status status-${status}`}
                  >
                    {status}
                  </span>
                </div>
                {draft.purpose && (
                  <div className="issue-draft-summary">
                    <strong>Purpose:</strong> {draft.purpose}
                  </div>
                )}
                {draft.expectedOutcome && (
                  <div className="issue-draft-summary">
                    <strong>Expected Outcome:</strong>{" "}
                    {draft.expectedOutcome}
                  </div>
                )}
                {draft.githubIssueUrl && (
                  <div className="issue-draft-github-link">
                    <a
                      href={draft.githubIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      GitHub Issue #{draft.githubIssueNumber}
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {showPushModal && (
        <PushModal
          goalId={selectedGoalId}
          onClose={() => {
            setShowPushModal(false);
            // Reload issues after push
            if (selectedMilestoneId) loadIssues(selectedMilestoneId);
          }}
        />
      )}
    </>
  );
}
