import { useState, useEffect, useCallback } from 'react';
import type { DashboardPage, GoalData, ResearchItem, MilestoneData, IssueDraft } from '../utils/types';
import { apiFetch, escHtml } from '../utils/api';

interface DashboardProps {
  currentPage: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
  visible: boolean;
  token: string;
  onOpenPushModal: (goalId: string, milestoneId: string, issues: IssueDraft[], milestones: MilestoneData[]) => void;
}

const PAGES: { id: DashboardPage; icon: string; label: string }[] = [
  { id: 'goals', icon: '🎯', label: 'Goals' },
  { id: 'research', icon: '🔬', label: 'Research' },
  { id: 'milestones', icon: '🏁', label: 'Milestones' },
  { id: 'issues', icon: '📋', label: 'Issues' },
];

export default function Dashboard({ currentPage, onPageChange, visible, token, onOpenPushModal }: DashboardProps) {
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState('');

  // Resolve the effective token: prefer prop, fall back to localStorage (for tests that set it after load)
  const effectiveToken = token || localStorage.getItem('copilot_github_token') || '';

  // Load goals when dashboard becomes visible or token changes
  useEffect(() => {
    if (visible && effectiveToken) {
      apiFetch<{ goals: GoalData[] }>('/api/goals', effectiveToken)
        .then(data => {
          setGoals(data.goals || []);
          if (data.goals?.length > 0 && !selectedGoalId) {
            setSelectedGoalId(data.goals[0].id);
          }
        })
        .catch(() => setGoals([]));
    }
  }, [visible, effectiveToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div id="dashboard-view" className={visible ? 'active' : ''}>
      <nav id="dashboard-nav">
        <div id="dashboard-nav-header"><h3>Dashboard</h3></div>
        {PAGES.map(p => (
          <button
            key={p.id}
            className={`dashboard-nav-item${currentPage === p.id ? ' active' : ''}`}
            data-page={p.id}
            onClick={() => onPageChange(p.id)}
          >
            <span className="dashboard-nav-icon">{p.icon}</span>
            <span className="dashboard-nav-label">{p.label}</span>
          </button>
        ))}
      </nav>

      <div id="dashboard-content">
        <GoalsPage visible={currentPage === 'goals'} goals={goals} token={effectiveToken} />
        <ResearchPage visible={currentPage === 'research'} goals={goals} token={effectiveToken} selectedGoalId={selectedGoalId} onGoalSelect={setSelectedGoalId} />
        <MilestonesPage visible={currentPage === 'milestones'} goals={goals} token={effectiveToken} selectedGoalId={selectedGoalId} onGoalSelect={setSelectedGoalId} />
        <IssuesPage visible={currentPage === 'issues'} goals={goals} token={effectiveToken} selectedGoalId={selectedGoalId} onGoalSelect={setSelectedGoalId} onOpenPushModal={onOpenPushModal} />
      </div>
    </div>
  );
}

// ============================================================
// Goals Page
// ============================================================

interface GoalsPageProps {
  visible: boolean;
  goals: GoalData[];
  token: string;
}

function GoalsPage({ visible, goals, token }: GoalsPageProps) {
  const [detailGoal, setDetailGoal] = useState<GoalData | null>(null);
  const [goalCounts, setGoalCounts] = useState<Record<string, { research: number; milestones: number; issues: number }>>({});

  // Fetch counts for each goal
  useEffect(() => {
    if (!visible || !token || goals.length === 0) return;
    goals.forEach(async (g) => {
      try {
        const [resData, msData] = await Promise.all([
          apiFetch<{ research: unknown[] }>(`/api/goals/${g.id}/research`, token),
          apiFetch<{ milestones: { id: string }[] }>(`/api/goals/${g.id}/milestones`, token),
        ]);
        const msIds = msData.milestones?.map(m => m.id) || [];
        let issueCount = 0;
        for (const msId of msIds) {
          try {
            const issueData = await apiFetch<{ issues: unknown[] }>(`/api/milestones/${msId}/issues`, token);
            issueCount += issueData.issues?.length || 0;
          } catch { /* ignore */ }
        }
        setGoalCounts(prev => ({
          ...prev,
          [g.id]: {
            research: resData.research?.length || 0,
            milestones: msData.milestones?.length || 0,
            issues: issueCount,
          },
        }));
      } catch { /* ignore */ }
    });
  }, [visible, token, goals]);

  const showDetail = useCallback(async (goalId: string) => {
    try {
      const data = await apiFetch<GoalData>(`/api/goals/${goalId}`, token);
      setDetailGoal(data);
    } catch { /* ignore */ }
  }, [token]);

  if (!visible) return <div className="dashboard-page" id="dashboard-page-goals" style={{ display: 'none' }} />;

  return (
    <div className="dashboard-page active" id="dashboard-page-goals">
      <div id="goals-list-view" style={{ display: detailGoal ? 'none' : undefined }}>
        <div className="dashboard-page-header">
          <h2>Goals</h2>
          <p>Planning goals defined in your conversations</p>
        </div>
        <div id="goals-list-content">
          {goals.length === 0 ? (
            <div className="dashboard-empty">
              <span className="dashboard-empty-icon">🎯</span>
              <p>No goals yet. Use the chat to define planning goals with Copilot.</p>
            </div>
          ) : (
            goals.map(g => {
              const counts = goalCounts[g.id] || { research: 0, milestones: 0, issues: 0 };
              return (
                <div
                  key={g.id}
                  className="goal-list-item"
                  tabIndex={0}
                  role="button"
                  onClick={() => showDetail(g.id)}
                  onKeyDown={e => { if (e.key === 'Enter') showDetail(g.id); }}
                >
                  <div className="goal-list-item-title">{g.goal}</div>
                  <div className="goal-list-item-intent">{g.intent}</div>
                  <div className="goal-list-item-counts">
                    <span>{counts.research} research</span>
                    <span>{counts.milestones} milestones</span>
                    <span>{counts.issues} issues</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <GoalDetailView
        goal={detailGoal}
        visible={!!detailGoal}
        counts={detailGoal ? goalCounts[detailGoal.id] : undefined}
        onBack={() => setDetailGoal(null)}
      />
    </div>
  );
}

function GoalDetailView({ goal, visible, counts, onBack }: {
  goal: GoalData | null;
  visible: boolean;
  counts?: { research: number; milestones: number; issues: number };
  onBack: () => void;
}) {
  if (!visible || !goal) {
    return <div id="goals-detail-view" className="hidden" />;
  }

  return (
    <div id="goals-detail-view">
      <button className="goal-detail-back" onClick={onBack}>← Back to Goals</button>
      <h2 className="goal-detail-title">{goal.goal}</h2>
      <div className="goal-detail-intent">{goal.intent}</div>

      <div className="goal-detail-counts">
        <div className="goal-detail-count-badge">
          <span className="count-number">{counts?.research ?? 0}</span>
          <span className="count-label">Research</span>
        </div>
        <div className="goal-detail-count-badge">
          <span className="count-number">{counts?.milestones ?? 0}</span>
          <span className="count-label">Milestones</span>
        </div>
        <div className="goal-detail-count-badge">
          <span className="count-number">{counts?.issues ?? 0}</span>
          <span className="count-label">Issues</span>
        </div>
      </div>

      <div className="goal-detail-fields">
        {goal.problemStatement && (
          <div className="goal-detail-field">
            <span className="goal-detail-label">Problem Statement</span>
            <span className="goal-detail-value">{goal.problemStatement}</span>
          </div>
        )}
        {goal.businessValue && (
          <div className="goal-detail-field">
            <span className="goal-detail-label">Business Value</span>
            <span className="goal-detail-value">{goal.businessValue}</span>
          </div>
        )}
        {goal.targetOutcome && (
          <div className="goal-detail-field">
            <span className="goal-detail-label">Target Outcome</span>
            <span className="goal-detail-value">{goal.targetOutcome}</span>
          </div>
        )}
        {goal.successCriteria && goal.successCriteria.length > 0 && (
          <div className="goal-detail-field">
            <span className="goal-detail-label">Success Criteria</span>
            <ul>{goal.successCriteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Research Page
// ============================================================

interface ResearchPageProps {
  visible: boolean;
  goals: GoalData[];
  token: string;
  selectedGoalId: string;
  onGoalSelect: (id: string) => void;
}

function ResearchPage({ visible, goals, token, selectedGoalId, onGoalSelect }: ResearchPageProps) {
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const goalId = selectedGoalId || (goals.length > 0 ? goals[0].id : '');

  useEffect(() => {
    if (!visible || !token || !goalId) return;
    apiFetch<{ research: ResearchItem[] }>(`/api/goals/${goalId}/research`, token)
      .then(data => setItems(data.research || []))
      .catch(() => setItems([]));
  }, [visible, token, goalId]);

  const handleSave = async (item: ResearchItem) => {
    try {
      await apiFetch(`/api/goals/${goalId}/research/${item.id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings: editText }),
      });
      setItems(prev => prev.map(r => r.id === item.id ? { ...r, findings: editText } : r));
    } catch { /* ignore */ }
    setEditingId(null);
    setEditText('');
  };

  // Group by category
  const groups: Record<string, ResearchItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  const statusCounts: Record<string, number> = {};
  for (const item of items) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }

  if (!visible) return <div className="dashboard-page" id="dashboard-page-research" style={{ display: 'none' }} />;

  return (
    <div className="dashboard-page active" id="dashboard-page-research">
      <div className="dashboard-page-header">
        <h2>Research</h2>
        <p>Research items and questions for your planning goals</p>
      </div>
      {goals.length > 0 && (
        <div id="research-goal-selector">
          <select
            id="research-goal-select"
            className="research-goal-select"
            aria-label="Select goal to view research for"
            value={goalId}
            onChange={e => onGoalSelect(e.target.value)}
          >
            {goals.map(g => <option key={g.id} value={g.id}>{g.goal}</option>)}
          </select>
        </div>
      )}
      <div id="research-page-content">
        {items.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon">🔬</span>
            <p>No research items yet. Research will appear here once you define a goal.</p>
          </div>
        ) : (
          <>
            {Object.entries(groups).map(([category, categoryItems]) => (
              <div key={category} className="research-tracker-category">
                <div className="research-tracker-category-header">
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </div>
                {categoryItems.map(item => (
                  <div key={item.id} className="research-tracker-item">
                    <div className="research-tracker-header">
                      <span className={`research-item-status status-${item.status}`}>{item.status}</span>
                      <span className="research-tracker-question">{item.question}</span>
                      <button
                        className="research-tracker-edit-btn"
                        style={{ display: editingId === item.id ? 'none' : undefined }}
                        onClick={() => { setEditingId(item.id); setEditText(item.findings || ''); }}
                      >
                        ✏️ Edit
                      </button>
                    </div>
                    {item.findings && editingId !== item.id && (
                      <div className="research-tracker-findings">{item.findings}</div>
                    )}
                    {item.decision && (
                      <div className="research-tracker-decision">Decision: {item.decision}</div>
                    )}
                    {editingId === item.id && (
                      <div className="research-tracker-edit-area">
                        <textarea
                          className="research-tracker-textarea"
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          placeholder="Enter findings..."
                        />
                        <div className="research-tracker-edit-actions">
                          <button className="research-tracker-save-btn" onClick={() => handleSave(item)}>Save</button>
                          <button className="research-tracker-cancel-btn" onClick={() => { setEditingId(null); setEditText(''); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="research-tracker-summary">
              {Object.entries(statusCounts).map(([status, count]) => (
                <span key={status}>{status.charAt(0).toUpperCase() + status.slice(1)}: {count}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Milestones Page
// ============================================================

interface MilestonesPageProps {
  visible: boolean;
  goals: GoalData[];
  token: string;
  selectedGoalId: string;
  onGoalSelect: (id: string) => void;
}

function MilestonesPage({ visible, goals, token, selectedGoalId, onGoalSelect }: MilestonesPageProps) {
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const goalId = selectedGoalId || (goals.length > 0 ? goals[0].id : '');

  useEffect(() => {
    if (!visible || !token || !goalId) return;
    apiFetch<{ milestones: MilestoneData[] }>(`/api/goals/${goalId}/milestones`, token)
      .then(data => {
        const ms = data.milestones || [];
        setMilestones(ms);
        // Fetch issue counts per milestone
        ms.forEach(async (m) => {
          try {
            const issueData = await apiFetch<{ issues: unknown[] }>(`/api/milestones/${m.id}/issues`, token);
            setIssueCounts(prev => ({ ...prev, [m.id]: issueData.issues?.length || 0 }));
          } catch { setIssueCounts(prev => ({ ...prev, [m.id]: 0 })); }
        });
      })
      .catch(() => setMilestones([]));
  }, [visible, token, goalId]);

  const sorted = [...milestones].sort((a, b) => a.order - b.order);
  const orderMap = new Map<string, number>();
  for (const ms of sorted) orderMap.set(ms.id, ms.order);

  const statusCounts: Record<string, number> = {};
  for (const ms of sorted) {
    const s = ms.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  const formatStatus = (s: string) => {
    if (s === 'in-progress') return 'In Progress';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  if (!visible) return <div className="dashboard-page" id="dashboard-page-milestones" style={{ display: 'none' }} />;

  return (
    <div className="dashboard-page active" id="dashboard-page-milestones">
      <div className="dashboard-page-header">
        <h2>Milestones</h2>
        <p>Development milestones for your planning goals</p>
      </div>
      {goals.length > 0 && (
        <div id="milestone-goal-selector">
          <select
            id="milestone-goal-select"
            className="milestone-goal-select"
            aria-label="Select goal to view milestones for"
            value={goalId}
            onChange={e => onGoalSelect(e.target.value)}
          >
            {goals.map(g => <option key={g.id} value={g.id}>{g.goal}</option>)}
          </select>
        </div>
      )}
      <div id="milestone-page-content">
        {sorted.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon">🏁</span>
            <p>No milestones yet. Milestones will appear here after planning is complete.</p>
          </div>
        ) : (
          <>
            {sorted.map(ms => (
              <div key={ms.id} className="milestone-timeline-item">
                <span className="milestone-timeline-order">#{ms.order}</span>
                <span className="milestone-timeline-name">{ms.name}</span>
                <span className={`milestone-timeline-status status-${ms.status}`}>{ms.status}</span>
                <span className="milestone-timeline-goal">{ms.goal}</span>
                <span className="milestone-timeline-issue-count">
                  {(issueCounts[ms.id] ?? 0) === 1
                    ? `${issueCounts[ms.id]} issue`
                    : `${issueCounts[ms.id] ?? 0} issues`}
                </span>
                {ms.dependencies && ms.dependencies.length > 0 && (
                  <div className="milestone-timeline-deps">
                    Depends on: {ms.dependencies.map(dep => (
                      <span key={dep} className="milestone-timeline-dep-tag">#{orderMap.get(dep) || '?'}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="milestone-timeline-summary">
              {Object.entries(statusCounts).map(([status, count]) => (
                <span key={status}>{formatStatus(status)}: {count}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Issues Page
// ============================================================

interface IssuesPageProps {
  visible: boolean;
  goals: GoalData[];
  token: string;
  selectedGoalId: string;
  onGoalSelect: (id: string) => void;
  onOpenPushModal: (goalId: string, milestoneId: string, issues: IssueDraft[], milestones: MilestoneData[]) => void;
}

function IssuesPage({ visible, goals, token, selectedGoalId, onGoalSelect, onOpenPushModal }: IssuesPageProps) {
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState('');
  const [issues, setIssues] = useState<IssueDraft[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const goalId = selectedGoalId || (goals.length > 0 ? goals[0].id : '');

  // Load milestones when goal changes
  useEffect(() => {
    if (!visible || !token || !goalId) return;
    apiFetch<{ milestones: MilestoneData[] }>(`/api/goals/${goalId}/milestones`, token)
      .then(data => {
        const ms = data.milestones || [];
        setMilestones(ms);
        if (ms.length > 0) {
          setSelectedMilestoneId(ms[0].id);
        }
      })
      .catch(() => setMilestones([]));
  }, [visible, token, goalId]);

  // Load issues when milestone changes
  useEffect(() => {
    if (!visible || !token || !selectedMilestoneId) return;
    apiFetch<{ issues: IssueDraft[] }>(`/api/milestones/${selectedMilestoneId}/issues`, token)
      .then(data => setIssues(data.issues || []))
      .catch(() => setIssues([]));
  }, [visible, token, selectedMilestoneId]);

  const normalizeStatus = (s: string) => {
    if (s === 'approved' || s === 'reviewed') return 'ready';
    return s;
  };

  const sorted = [...issues].sort((a, b) => a.order - b.order);

  const statusCounts: Record<string, number> = {};
  for (const issue of sorted) {
    const s = normalizeStatus(issue.status);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  const hasDraftOrReady = sorted.some(i => {
    const s = normalizeStatus(i.status);
    return s === 'draft' || s === 'ready';
  });

  const handleApprove = async (issue: IssueDraft) => {
    try {
      const data = await apiFetch<IssueDraft>(`/api/milestones/${issue.milestoneId}/issues/${issue.id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      });
      setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: data.status || 'ready' } : i));
    } catch { /* ignore */ }
  };

  const handleBatchApprove = async () => {
    const toApprove = sorted.filter(i => {
      const s = normalizeStatus(i.status);
      return s === 'draft' || s === 'ready';
    });
    for (const issue of toApprove) {
      try {
        await apiFetch<IssueDraft>(`/api/milestones/${issue.milestoneId}/issues/${issue.id}`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ready' }),
        });
        setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: 'ready' } : i));
      } catch { /* ignore */ }
    }
  };

  const handlePushToGitHub = () => {
    onOpenPushModal(goalId, selectedMilestoneId, issues, milestones);
  };

  const showPushButton = token && goals.length > 0 && issues.length > 0;

  const buildMarkdownPreview = (issue: IssueDraft) => {
    let md = '';
    if (issue.purpose) md += `<h2>Purpose</h2><p>${escHtml(issue.purpose)}</p>`;
    if (issue.problem) md += `<h2>Problem</h2><p>${escHtml(issue.problem)}</p>`;
    if (issue.expectedOutcome) md += `<h2>Expected Outcome</h2><p>${escHtml(issue.expectedOutcome)}</p>`;
    if (issue.scopeBoundaries) md += `<h2>Scope</h2><p>${escHtml(issue.scopeBoundaries)}</p>`;
    if (issue.acceptanceCriteria && issue.acceptanceCriteria.length > 0) {
      md += '<h2>Acceptance Criteria</h2><ul>';
      issue.acceptanceCriteria.forEach(c => { md += `<li>${escHtml(c)}</li>`; });
      md += '</ul>';
    }
    return md;
  };

  if (!visible) return <div className="dashboard-page" id="dashboard-page-issues" style={{ display: 'none' }} />;

  return (
    <div className="dashboard-page active" id="dashboard-page-issues">
      <div className="dashboard-page-header">
        <div className="dashboard-page-header-row">
          <div>
            <h2>Issues</h2>
            <p>GitHub issue drafts ready for review and push</p>
          </div>
          <button
            id="push-to-github-btn"
            className="push-to-github-btn"
            style={{ display: showPushButton ? undefined : 'none' }}
            aria-label="Push ready issues to GitHub"
            onClick={handlePushToGitHub}
          >
            🚀 Push to GitHub
          </button>
        </div>
      </div>
      {goals.length > 0 && (
        <div id="issue-goal-selector">
          <select
            id="issue-goal-select"
            className="issue-goal-select"
            aria-label="Select goal to view issues for"
            value={goalId}
            onChange={e => onGoalSelect(e.target.value)}
          >
            {goals.map(g => <option key={g.id} value={g.id}>{g.goal}</option>)}
          </select>
        </div>
      )}
      {milestones.length > 0 && (
        <div id="issue-milestone-selector">
          <select
            id="issue-milestone-select"
            className="issue-milestone-select"
            aria-label="Select milestone to view issues for"
            value={selectedMilestoneId}
            onChange={e => setSelectedMilestoneId(e.target.value)}
          >
            {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      <div id="issue-page-content">
        {sorted.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon">📋</span>
            <p>No issue drafts yet. Issue drafts will appear here after milestones are planned.</p>
          </div>
        ) : (
          <>
            {hasDraftOrReady && (
              <div className="issue-draft-batch-bar">
                <button className="issue-draft-batch-approve-btn" onClick={handleBatchApprove}>
                  ✅ Approve All
                </button>
              </div>
            )}
            {sorted.map(issue => {
              const status = normalizeStatus(issue.status);
              const isExpanded = expandedId === issue.id;
              const showPreview = previewId === issue.id;

              return (
                <div key={issue.id} className="issue-draft-item">
                  <div className="issue-draft-header">
                    <span className="issue-draft-order">#{issue.order}</span>
                    <span className="issue-draft-title">{issue.title}</span>
                    <span className={`issue-draft-status status-${status}`}>{status}</span>
                    {status === 'draft' && (
                      <button className="issue-draft-approve-btn" onClick={() => handleApprove(issue)}>✅ Approve</button>
                    )}
                    <button
                      className="issue-draft-expand-btn"
                      onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                  {issue.githubIssueNumber && (
                    <span className="issue-draft-github-link">#{issue.githubIssueNumber}</span>
                  )}
                  <div className={`issue-draft-body${isExpanded ? ' expanded' : ''}`}>
                    {isExpanded && (
                      <>
                        {issue.purpose && (
                          <div className="issue-draft-field">
                            <span className="issue-draft-field-label">Purpose</span>
                            <span className="issue-draft-field-value">{issue.purpose}</span>
                          </div>
                        )}
                        {issue.problem && (
                          <div className="issue-draft-field">
                            <span className="issue-draft-field-label">Problem</span>
                            <span className="issue-draft-field-value">{issue.problem}</span>
                          </div>
                        )}
                        {issue.expectedOutcome && (
                          <div className="issue-draft-field">
                            <span className="issue-draft-field-label">Expected Outcome</span>
                            <span className="issue-draft-field-value">{issue.expectedOutcome}</span>
                          </div>
                        )}
                        {issue.scopeBoundaries && (
                          <div className="issue-draft-field">
                            <span className="issue-draft-field-label">Scope</span>
                            <span className="issue-draft-field-value">{issue.scopeBoundaries}</span>
                          </div>
                        )}
                        {issue.acceptanceCriteria && issue.acceptanceCriteria.length > 0 && (
                          <div className="issue-draft-field">
                            <span className="issue-draft-field-label">Acceptance Criteria</span>
                            <ul className="issue-draft-field-value">
                              {issue.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                          </div>
                        )}
                        {issue.filesToModify && issue.filesToModify.length > 0 && (
                          <div className="issue-draft-field">
                            <span className="issue-draft-field-label">Files to Modify</span>
                            <ul className="issue-draft-field-value">
                              {issue.filesToModify.map((f, i) => <li key={i}><code>{f.path}</code> — {f.reason}</li>)}
                            </ul>
                          </div>
                        )}
                        {issue.filesToRead && issue.filesToRead.length > 0 && (
                          <div className="issue-draft-field">
                            <span className="issue-draft-field-label">Files to Read</span>
                            <ul className="issue-draft-field-value">
                              {issue.filesToRead.map((f, i) => <li key={i}><code>{f.path}</code> — {f.reason}</li>)}
                            </ul>
                          </div>
                        )}
                        <button
                          className="issue-draft-preview-toggle"
                          onClick={() => setPreviewId(showPreview ? null : issue.id)}
                        >
                          {showPreview ? 'Hide Preview' : 'Show Preview'}
                        </button>
                        {showPreview && (
                          <div
                            className="issue-draft-md-preview"
                            dangerouslySetInnerHTML={{ __html: buildMarkdownPreview(issue) }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="issue-draft-summary">
              {Object.entries(statusCounts).map(([status, count]) => (
                <span key={status}>{status.charAt(0).toUpperCase() + status.slice(1)}: {count}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
