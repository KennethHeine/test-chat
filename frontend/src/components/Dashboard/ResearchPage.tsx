import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../utils/api.ts";
import type { Goal, ResearchItem } from "../../types.ts";
import {
  CATEGORY_LABELS,
  RESEARCH_CATEGORY_ORDER,
  VALID_STATUSES,
} from "../../types.ts";

interface ResearchPageProps {
  token: string;
  active: boolean;
}

export function ResearchPage({ token, active }: ResearchPageProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editFindings, setEditFindings] = useState("");
  const [editDecision, setEditDecision] = useState("");
  const [editStatus, setEditStatus] = useState("");

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

  const loadResearch = useCallback(
    async (goalId: string) => {
      if (!goalId) return;
      setIsLoading(true);
      try {
        const res = await apiFetch(
          `/api/goals/${encodeURIComponent(goalId)}/research`,
        );
        if (!res.ok) {
          setItems([]);
          return;
        }
        const data = await res.json();
        setItems(data.items || []);
      } catch (err) {
        console.warn("Failed to load research:", err);
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (active) loadGoals();
  }, [active, loadGoals]);

  useEffect(() => {
    if (selectedGoalId) loadResearch(selectedGoalId);
  }, [selectedGoalId, loadResearch]);

  const startEditing = useCallback((item: ResearchItem) => {
    setEditingItem(item.id);
    setEditFindings(item.findings || "");
    setEditDecision(item.decision || "");
    setEditStatus(item.status || "open");
  }, []);

  const saveEdit = useCallback(
    async (item: ResearchItem) => {
      try {
        await apiFetch(
          `/api/goals/${encodeURIComponent(selectedGoalId)}/research/${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              findings: editFindings,
              decision: editDecision,
              status: editStatus,
            }),
          },
        );
        setEditingItem(null);
        loadResearch(selectedGoalId);
      } catch (err) {
        console.warn("Failed to save research item:", err);
      }
    },
    [selectedGoalId, editFindings, editDecision, editStatus, loadResearch],
  );

  // Group items by category
  const grouped = new Map<string, ResearchItem[]>();
  for (const item of items) {
    const cat = item.category || "domain";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const orderedKeys = [
    ...RESEARCH_CATEGORY_ORDER.filter((c) => grouped.has(c)),
    ...Array.from(grouped.keys()).filter(
      (c) => !RESEARCH_CATEGORY_ORDER.includes(c),
    ),
  ];

  return (
    <>
      <div className="dashboard-page-header">
        <h3>Research</h3>
      </div>
      <div
        id="research-goal-selector"
        style={{ display: goals.length > 1 ? "block" : "none" }}
      >
        <select
          id="research-goal-select"
          className="research-goal-select"
          aria-label="Select goal to view research for"
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
      <div id="research-page-content">
        {isLoading ? (
          <div className="dashboard-loading">
            Loading research items...
          </div>
        ) : items.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon">🔬</span>
            <p>No research items yet.</p>
            <p>
              Ask the agent to generate a research checklist for your
              goal.
            </p>
          </div>
        ) : (
          orderedKeys.map((category) => (
            <div key={category} className="research-category-group">
              <div className="research-category-header">
                {CATEGORY_LABELS[category] || "Other"}
              </div>
              {grouped.get(category)!.map((item) => (
                <div
                  key={item.id}
                  className="research-tracker-item"
                  data-item-id={item.id}
                >
                  <div className="research-tracker-header">
                    <span
                      className={`research-tracker-status status-${VALID_STATUSES.includes(item.status) ? item.status : "open"}`}
                    >
                      {VALID_STATUSES.includes(item.status)
                        ? item.status
                        : "open"}
                    </span>
                    <span className="research-item-question">
                      {item.question}
                    </span>
                    <button
                      className="research-tracker-edit-btn"
                      onClick={() => startEditing(item)}
                    >
                      ✏️
                    </button>
                  </div>
                  {item.findings && editingItem !== item.id && (
                    <div className="research-tracker-summary">
                      <strong>Findings:</strong> {item.findings}
                    </div>
                  )}
                  {item.decision && editingItem !== item.id && (
                    <div className="research-tracker-summary">
                      <strong>Decision:</strong> {item.decision}
                    </div>
                  )}
                  {item.sourceUrl && editingItem !== item.id && (
                    <div className="research-tracker-summary">
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Source
                      </a>
                    </div>
                  )}
                  {editingItem === item.id && (
                    <div className="research-tracker-edit">
                      <label>
                        Status:
                        <select
                          value={editStatus}
                          onChange={(e) =>
                            setEditStatus(e.target.value)
                          }
                        >
                          {VALID_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Findings:
                        <textarea
                          className="research-tracker-textarea"
                          value={editFindings}
                          onChange={(e) =>
                            setEditFindings(e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Decision:
                        <textarea
                          className="research-tracker-textarea"
                          value={editDecision}
                          onChange={(e) =>
                            setEditDecision(e.target.value)
                          }
                        />
                      </label>
                      <div className="research-tracker-edit-actions">
                        <button
                          className="btn"
                          onClick={() => saveEdit(item)}
                        >
                          Save
                        </button>
                        <button
                          className="btn"
                          onClick={() => setEditingItem(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
