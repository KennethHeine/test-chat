import { useState, useEffect, useCallback } from 'react';
import type { IssueDraft, MilestoneData } from '../utils/types';

interface PushModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  goalId: string;
  milestoneId: string;
  issues: IssueDraft[];
  milestones: MilestoneData[];
}

interface MutationItem {
  type: 'milestone' | 'issue';
  id: string;
  label: string;
  milestoneId?: string;
}

interface PushResult {
  label: string;
  success: boolean;
  url?: string;
  error?: string;
}

const PUSH_REPO_STORAGE_KEY = 'copilot_push_repo';

export default function PushModal({ visible, onClose, token, goalId: _goalId, milestoneId, issues, milestones }: PushModalProps) {
  void _goalId; // reserved for future use
  const [step, setStep] = useState<'review' | 'progress' | 'results'>('review');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [mutations, setMutations] = useState<MutationItem[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [progressItems, setProgressItems] = useState<PushResult[]>([]);
  const [results, setResults] = useState<PushResult[]>([]);

  // Restore saved repo
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PUSH_REPO_STORAGE_KEY);
      if (saved) {
        const { owner: o, repo: r } = JSON.parse(saved);
        if (o) setOwner(o);
        if (r) setRepo(r);
      }
    } catch { /* ignore */ }
  }, []);

  // Build mutation list when modal opens
  useEffect(() => {
    if (!visible) return;
    setStep('review');
    setProgressIndex(0);
    setProgressItems([]);
    setResults([]);

    const muts: MutationItem[] = [];

    // Find the selected milestone
    const ms = milestones.find(m => m.id === milestoneId);
    if (ms && !ms.githubMilestoneUrl) {
      muts.push({ type: 'milestone', id: ms.id, label: `Milestone: ${ms.name}` });
    }

    // Find issues that are ready
    for (const issue of issues) {
      const status = issue.status === 'approved' || issue.status === 'reviewed' ? 'ready' : issue.status;
      if (status === 'ready' && !issue.githubIssueUrl) {
        muts.push({ type: 'issue', id: issue.id, milestoneId: issue.milestoneId, label: `Issue: ${issue.title}` });
      }
    }

    setMutations(muts);
  }, [visible, milestoneId, milestones, issues]);

  // Handle escape key
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  const confirmEnabled = owner.trim() && repo.trim() && mutations.length > 0;

  const executePush = useCallback(async () => {
    setStep('progress');
    localStorage.setItem(PUSH_REPO_STORAGE_KEY, JSON.stringify({ owner: owner.trim(), repo: repo.trim() }));

    const allResults: PushResult[] = [];
    const total = mutations.length;

    for (let i = 0; i < total; i++) {
      const mut = mutations[i];
      setProgressIndex(i + 1);

      try {
        let url = '';
        if (mut.type === 'milestone') {
          const res = await fetch(`/api/milestones/${mut.id}/push-to-github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ owner: owner.trim(), repo: repo.trim() }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          url = data.githubUrl || '';
        } else {
          const res = await fetch(`/api/milestones/${mut.milestoneId}/issues/${mut.id}/push-to-github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ owner: owner.trim(), repo: repo.trim() }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          url = data.githubIssueUrl || '';
        }
        const result: PushResult = { label: mut.label, success: true, url };
        allResults.push(result);
        setProgressItems([...allResults]);
      } catch (err) {
        const result: PushResult = { label: mut.label, success: false, error: (err as Error).message };
        allResults.push(result);
        setProgressItems([...allResults]);
      }
    }

    setResults(allResults);
    setStep('results');
  }, [mutations, owner, repo, token]);

  if (!visible) return <div id="push-modal" className="push-modal-overlay" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="push-modal-title" />;

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return (
    <div id="push-modal" className="push-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="push-modal-title">
      <div className="push-modal">
        <div className="push-modal-header">
          <h2 id="push-modal-title" className="push-modal-title">🚀 Push to GitHub</h2>
          <button id="push-modal-close" className="push-modal-close" aria-label="Close push modal" onClick={onClose}>✕</button>
        </div>

        {/* Step 1: Configure + Review */}
        <div id="push-modal-review" className="push-modal-step" style={{ display: step === 'review' ? undefined : 'none' }}>
          <div className="push-modal-repo-config">
            <div className="push-modal-field">
              <label htmlFor="push-owner-input" className="push-modal-label">Repository Owner</label>
              <input
                id="push-owner-input"
                type="text"
                className="push-modal-input"
                placeholder="e.g. octocat"
                autoComplete="off"
                spellCheck={false}
                value={owner}
                onChange={e => setOwner(e.target.value)}
              />
            </div>
            <div className="push-modal-field">
              <label htmlFor="push-repo-input" className="push-modal-label">Repository Name</label>
              <input
                id="push-repo-input"
                type="text"
                className="push-modal-input"
                placeholder="e.g. my-project"
                autoComplete="off"
                spellCheck={false}
                value={repo}
                onChange={e => setRepo(e.target.value)}
              />
            </div>
          </div>
          <div id="push-mutation-list" className="push-mutation-list">
            {mutations.length === 0 ? (
              <div className="push-no-mutations">No mutations to push. All items are already created.</div>
            ) : (
              mutations.map(mut => (
                <div key={`${mut.type}-${mut.id}`} className="push-mutation-item">
                  <span className="push-mutation-icon">{mut.type === 'milestone' ? '🏁' : '📋'}</span>
                  <span className="push-mutation-name">{mut.label}</span>
                </div>
              ))
            )}
          </div>
          <div className="push-modal-footer">
            <span id="push-mutation-count" className="push-mutation-count">
              {mutations.length} item{mutations.length !== 1 ? 's' : ''} to push
            </span>
            <button
              id="push-confirm-btn"
              className="push-confirm-btn"
              disabled={!confirmEnabled}
              onClick={executePush}
            >
              Confirm &amp; Push
            </button>
          </div>
        </div>

        {/* Step 2: Progress */}
        <div id="push-modal-progress" className="push-modal-step" style={{ display: step === 'progress' ? undefined : 'none' }}>
          <div className="push-progress-header">
            <span id="push-progress-label" className="push-progress-label">Pushing to GitHub…</span>
            <span id="push-progress-count" className="push-progress-count">{progressIndex} / {mutations.length}</span>
          </div>
          <div className="push-progress-bar-wrap">
            <div id="push-progress-bar" className="push-progress-bar" style={{ width: mutations.length > 0 ? `${(progressIndex / mutations.length) * 100}%` : '0%' }} />
          </div>
          <div id="push-progress-items" className="push-progress-items">
            {progressItems.map((item, i) => (
              <div key={i} className={`push-progress-item ${item.success ? 'success' : 'error'}`}>
                {item.success ? '✅' : '❌'} {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Step 3: Results */}
        <div id="push-modal-results" className="push-modal-step" style={{ display: step === 'results' ? undefined : 'none' }}>
          <div id="push-results-summary" className="push-results-summary">
            {failed === 0
              ? `✅ All ${succeeded} item${succeeded !== 1 ? 's' : ''} pushed successfully!`
              : `⚠️ ${succeeded} succeeded, ${failed} failed`}
          </div>
          <div id="push-results-list" className="push-results-list">
            {results.map((item, i) => (
              <div key={i} className={`push-results-item ${item.success ? 'success' : 'error'}`}>
                {item.success ? '✅' : '❌'} {item.label}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="push-results-item-link">{item.url}</a>
                )}
                {item.error && <span className="push-results-item-error">{item.error}</span>}
              </div>
            ))}
          </div>
          <div className="push-modal-footer">
            <button id="push-done-btn" className="push-done-btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
