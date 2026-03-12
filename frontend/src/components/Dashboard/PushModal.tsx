import { useState, useEffect, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { apiFetch } from "../../utils/api.ts";
import type { PushMutation, Milestone, IssueDraft } from "../../types.ts";

interface PushModalProps {
  goalId: string;
  onClose: () => void;
}

export function PushModal({ goalId, onClose }: PushModalProps) {
  const [step, setStep] = useState<"review" | "progress" | "results">("review");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [mutations, setMutations] = useState<PushMutation[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [results, setResults] = useState<PushMutation[]>([]);

  // Load milestones and issues to build mutation list
  useEffect(() => {
    async function load() {
      try {
        const msRes = await apiFetch(
          `/api/goals/${encodeURIComponent(goalId)}/milestones`,
        );
        if (!msRes.ok) return;
        const msData = await msRes.json();
        const milestones: Milestone[] = msData.milestones || [];

        const muts: PushMutation[] = [];

        for (const ms of milestones) {
          // Add milestone if not yet pushed
          if (!ms.githubNumber) {
            muts.push({
              type: "milestone",
              id: ms.id,
              label: `Milestone: ${ms.name}`,
              status: "pending",
            });
          }

          // Fetch issues for this milestone
          const issueRes = await apiFetch(
            `/api/milestones/${encodeURIComponent(ms.id)}/issues`,
          );
          if (!issueRes.ok) continue;
          const issueData = await issueRes.json();
          const issues: IssueDraft[] = issueData.issues || [];

          for (const issue of issues) {
            if (issue.status === "ready") {
              muts.push({
                type: "issue",
                id: issue.id,
                milestoneId: ms.id,
                label: `Issue: ${issue.title}`,
                status: "pending",
              });
            }
          }
        }

        setMutations(muts);
      } catch (err) {
        console.warn("Failed to load push data:", err);
      }
    }
    load();
  }, [goalId]);

  const canConfirm = owner.trim() && repo.trim() && mutations.length > 0;

  const executePush = useCallback(async () => {
    setStep("progress");
    const updated = [...mutations];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < updated.length; i++) {
      setProgressIndex(i);
      updated[i] = { ...updated[i], status: "pushing" };
      setMutations([...updated]);

      try {
        let url: string;
        if (updated[i].type === "milestone") {
          url = `/api/milestones/${encodeURIComponent(updated[i].id)}/push-to-github`;
        } else {
          url = `/api/milestones/${encodeURIComponent(updated[i].milestoneId!)}/issues/${encodeURIComponent(updated[i].id)}/push-to-github`;
        }

        const res = await apiFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: owner.trim(), repo: repo.trim() }),
        });

        if (res.ok) {
          const data = await res.json();
          updated[i] = {
            ...updated[i],
            status: "success",
            githubUrl: data.githubUrl || data.url || "",
          };
          successCount++;
        } else {
          const errData = await res.json().catch(() => ({ error: "Failed" }));
          updated[i] = {
            ...updated[i],
            status: "error",
            error: errData.error || `HTTP ${res.status}`,
          };
          failCount++;
        }
      } catch (err) {
        updated[i] = {
          ...updated[i],
          status: "error",
          error: err instanceof Error ? err.message : "Network error",
        };
        failCount++;
      }

      setMutations([...updated]);
    }

    setResults(updated);
    setStep("results");
    void successCount;
    void failCount;
  }, [mutations, owner, repo]);

  const handleBackdropClick = useCallback(
    (e: ReactMouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      id="push-modal"
      className="push-modal-overlay"
      style={{ display: "flex" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="push-modal">
        <div className="push-modal-header">
          <h2 id="push-modal-title" className="push-modal-title">
            🚀 Push to GitHub
          </h2>
          <button
            id="push-modal-close"
            className="push-modal-close"
            aria-label="Close push modal"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {step === "review" && (
          <div id="push-modal-review" className="push-modal-step">
            <div className="push-modal-repo-config">
              <label>
                Owner:
                <input
                  id="push-owner-input"
                  type="text"
                  className="push-modal-input"
                  placeholder="e.g. octocat"
                  autoComplete="off"
                  spellCheck={false}
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </label>
              <label>
                Repository:
                <input
                  id="push-repo-input"
                  type="text"
                  className="push-modal-input"
                  placeholder="e.g. my-project"
                  autoComplete="off"
                  spellCheck={false}
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
              </label>
            </div>
            <div id="push-mutation-list" className="push-mutation-list">
              {mutations.map((m, i) => (
                <div key={i} className="push-mutation-item">
                  <span className={`push-mutation-type type-${m.type}`}>
                    {m.type}
                  </span>
                  <span className="push-mutation-label">{m.label}</span>
                </div>
              ))}
              {mutations.length === 0 && (
                <div className="push-mutation-empty">
                  No items to push.
                </div>
              )}
            </div>
            <div className="push-modal-footer">
              <span id="push-mutation-count" className="push-mutation-count">
                {mutations.length} item(s) to push
              </span>
              <button
                id="push-confirm-btn"
                className="push-confirm-btn"
                disabled={!canConfirm}
                onClick={executePush}
              >
                Confirm & Push
              </button>
            </div>
          </div>
        )}

        {step === "progress" && (
          <div
            id="push-modal-progress"
            className="push-modal-step"
          >
            <div className="push-progress-header">
              <span
                id="push-progress-label"
                className="push-progress-label"
              >
                Pushing to GitHub…
              </span>
              <span
                id="push-progress-count"
                className="push-progress-count"
              >
                {progressIndex + 1} / {mutations.length}
              </span>
            </div>
            <div className="push-progress-bar-wrap">
              <div
                id="push-progress-bar"
                className="push-progress-bar"
                style={{
                  width: `${((progressIndex + 1) / mutations.length) * 100}%`,
                }}
              />
            </div>
            <div id="push-progress-items" className="push-progress-items">
              {mutations.map((m, i) => (
                <div key={i} className={`push-progress-item status-${m.status}`}>
                  {m.label} — {m.status}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "results" && (
          <div
            id="push-modal-results"
            className="push-modal-step"
          >
            <div id="push-results-summary" className="push-results-summary">
              {results.filter((r) => r.status === "success").length} succeeded,{" "}
              {results.filter((r) => r.status === "error").length} failed
            </div>
            <div id="push-results-list" className="push-results-list">
              {results.map((r, i) => (
                <div key={i} className={`push-results-item status-${r.status}`}>
                  <span>{r.label}</span>
                  {r.status === "success" && r.githubUrl && (
                    <a
                      href={r.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on GitHub
                    </a>
                  )}
                  {r.status === "error" && r.error && (
                    <span className="push-result-error">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="push-modal-footer">
              <button
                id="push-done-btn"
                className="push-done-btn"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
