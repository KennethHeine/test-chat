import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../utils/api.ts";
import type { Goal, Milestone, IssueDraft } from "../../types.ts";
import {
  VALID_ISSUE_DRAFT_STATUSES,
  DEFAULT_ISSUE_DRAFT_STATUS,
} from "../../types.ts";
import { PushModal } from "./PushModal.tsx";
import { escHtml } from "../../utils/escHtml.ts";

interface IssuesPageProps {
  token: string;
  active: boolean;
}

interface FileRef {
  path: string;
  reason: string;
}

export function IssuesPage({ active }: IssuesPageProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] =
    useState<string>("");
  const [issues, setIssues] = useState<IssueDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [previewItems, setPreviewItems] = useState<Set<string>>(new Set());

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
      } else {
        setSelectedMilestoneId("");
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
  const hasDraftOrReady = issues.some((i) => i.status === "draft" || i.status === "ready");

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const togglePreview = useCallback((id: string) => {
    setPreviewItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const approveIssue = useCallback(
    async (issueId: string) => {
      try {
        const res = await apiFetch(
          `/api/milestones/${encodeURIComponent(selectedMilestoneId)}/issues/${encodeURIComponent(issueId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ready" }),
          },
        );
        if (res.ok) {
          // Optimistically update local state
          setIssues((prev) =>
            prev.map((i) =>
              i.id === issueId ? { ...i, status: "ready" } : i,
            ),
          );
        }
      } catch (err) {
        console.warn("Failed to approve issue:", err);
      }
    },
    [selectedMilestoneId],
  );

  const batchApprove = useCallback(async () => {
    const toApprove = issues.filter(
      (i) => i.status === "draft" || i.status === "ready",
    );
    const approved = new Set<string>();
    for (const issue of toApprove) {
      try {
        const res = await apiFetch(
          `/api/milestones/${encodeURIComponent(selectedMilestoneId)}/issues/${encodeURIComponent(issue.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ready" }),
          },
        );
        if (res.ok) {
          approved.add(issue.id);
        }
      } catch (err) {
        console.warn("Failed to approve issue:", err);
      }
    }
    // Optimistically update local state
    setIssues((prev) =>
      prev.map((i) =>
        approved.has(i.id) ? { ...i, status: "ready" } : i,
      ),
    );
  }, [issues, selectedMilestoneId]);

  // Summary counts
  const draftCount = issues.filter((i) => i.status === "draft").length;
  const readyCount = issues.filter((i) => i.status === "ready").length;
  const createdCount = issues.filter((i) => i.status === "created").length;
  const summaryParts: string[] = [];
  if (draftCount > 0) summaryParts.push(`Draft: ${draftCount}`);
  if (readyCount > 0) summaryParts.push(`Ready: ${readyCount}`);
  if (createdCount > 0) summaryParts.push(`Created: ${createdCount}`);

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
      {hasDraftOrReady && issues.length > 0 && (
        <div className="issue-draft-batch-bar">
          <button className="issue-draft-batch-approve-btn btn" onClick={batchApprove}>
            Approve All
          </button>
        </div>
      )}
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
          <>
            {issues.map((draft) => {
              const rawStatus = draft.status || DEFAULT_ISSUE_DRAFT_STATUS;
              const status = VALID_ISSUE_DRAFT_STATUSES.includes(
                rawStatus,
              )
                ? rawStatus
                : DEFAULT_ISSUE_DRAFT_STATUS;
              const isExpanded = expandedItems.has(draft.id);
              const isPreview = previewItems.has(draft.id);
              const draftData = draft as IssueDraft & Record<string, unknown>;
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
                    <button
                      className="issue-draft-expand-btn"
                      onClick={() => toggleExpand(draft.id)}
                    >
                      {isExpanded ? "▼" : "▶"}
                    </button>
                    {status === "draft" && (
                      <button
                        className="issue-draft-approve-btn btn"
                        onClick={() => approveIssue(draft.id)}
                      >
                        Approve
                      </button>
                    )}
                  </div>
                  {draft.purpose && !isExpanded && (
                    <div className="issue-draft-summary">
                      <strong>Purpose:</strong> {draft.purpose}
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
                  {isExpanded && (
                    <div className={`issue-draft-body${isExpanded ? " expanded" : ""}`}>
                      <IssueDraftField label="Purpose" value={draft.purpose} />
                      <IssueDraftField label="Problem" value={draftData.problem as string} />
                      <IssueDraftField label="Expected Outcome" value={draft.expectedOutcome} />
                      <IssueDraftField
                        label="Acceptance Criteria"
                        value={
                          draft.acceptanceCriteria && draft.acceptanceCriteria.length > 0
                            ? draft.acceptanceCriteria.join("; ")
                            : undefined
                        }
                      />
                      <IssueDraftField
                        label="Files to Modify"
                        value={
                          (draftData.filesToModify as FileRef[] | undefined)?.map(
                            (f) => `${f.path} — ${f.reason}`,
                          ).join("; ") || undefined
                        }
                      />
                      <IssueDraftField
                        label="Files to Read"
                        value={
                          (draftData.filesToRead as FileRef[] | undefined)?.map(
                            (f) => `${f.path} — ${f.reason}`,
                          ).join("; ") || undefined
                        }
                      />
                      <button
                        className="issue-draft-preview-toggle btn"
                        onClick={() => togglePreview(draft.id)}
                      >
                        {isPreview ? "Hide Preview" : "Show Preview"}
                      </button>
                      {isPreview && (
                        <div
                          className="issue-draft-md-preview"
                          dangerouslySetInnerHTML={{
                            __html: buildIssuePreviewHtml(draft, draftData),
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {summaryParts.length > 0 && (
              <div className="issue-draft-summary issue-page-summary">
                {summaryParts.join(" · ")}
              </div>
            )}
          </>
        )}
      </div>
      {showPushModal && (
        <PushModal
          goalId={selectedGoalId}
          onClose={() => {
            setShowPushModal(false);
            if (selectedMilestoneId) loadIssues(selectedMilestoneId);
          }}
        />
      )}
    </>
  );
}

function IssueDraftField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="issue-draft-field">
      <span className="issue-draft-field-label">{label}</span>
      <span className="issue-draft-field-value">{value}</span>
    </div>
  );
}

function buildIssuePreviewHtml(
  draft: IssueDraft,
  draftData: IssueDraft & Record<string, unknown>,
): string {
  const lines: string[] = [];
  lines.push(`<h2>${escHtml("Purpose")}</h2>`);
  if (draft.purpose) lines.push(`<p>${escHtml(draft.purpose)}</p>`);
  if (draftData.problem) {
    lines.push(`<h2>${escHtml("Problem")}</h2>`);
    lines.push(`<p>${escHtml(String(draftData.problem))}</p>`);
  }
  if (draft.expectedOutcome) {
    lines.push(`<h2>${escHtml("Expected Outcome")}</h2>`);
    lines.push(`<p>${escHtml(draft.expectedOutcome)}</p>`);
  }
  return lines.join("\n");
}
