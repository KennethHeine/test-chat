import { useState, useRef, useEffect } from 'react';
import type { ChatItem, GoalData, ResearchItem, MilestoneData } from '../utils/types';
import { escHtml } from '../utils/api';
import GitHubIcon from './GitHubIcon';

interface ChatAreaProps {
  chatItems: ChatItem[];
  isStreaming: boolean;
  visible: boolean;
  onSendMessage: (text: string) => void;
  onStopStreaming: () => void;
}

export default function ChatArea({ chatItems, isStreaming, visible, onSendMessage, onStopStreaming }: ChatAreaProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  const hasMessages = chatItems.length > 0;

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chatItems]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div id="chat-area" style={{ display: visible ? undefined : 'none' }}>
      <div id="messages" ref={messagesRef}>
        {!hasMessages && (
          <div className="welcome" id="welcome">
            <GitHubIcon />
            <h2>Copilot Agent Orchestrator</h2>
            <p>Research codebases, plan coding tasks, and orchestrate agents</p>
          </div>
        )}
        {chatItems.map(item => {
          if (item.type === 'message') {
            return (
              <div key={item.id} className={`message ${item.role}${isStreaming && item.role === 'assistant' && item === chatItems[chatItems.length - 1] ? ' typing-indicator' : ''}`}>
                <div className="content">{item.content}</div>
              </div>
            );
          }
          if (item.type === 'goal-card') {
            return <GoalCard key={item.id} goal={item.data} />;
          }
          if (item.type === 'research-card') {
            return <ResearchCard key={item.id} items={item.data} />;
          }
          if (item.type === 'milestone-card') {
            return <MilestoneCard key={item.id} milestones={item.data} />;
          }
          return null;
        })}
      </div>

      <div id="input-area">
        <textarea
          id="message-input"
          placeholder="Ask Copilot to research a repo, plan tasks, or explore code..."
          rows={1}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn-primary"
          id="send-btn"
          onClick={handleSend}
          style={{ display: isStreaming ? 'none' : undefined }}
        >
          Send
        </button>
        <button
          className="btn btn-danger"
          id="stop-btn"
          title="Stop the current response"
          onClick={onStopStreaming}
          style={{ display: isStreaming ? undefined : 'none' }}
        >
          Stop
        </button>
      </div>
    </div>
  );
}

// --- Goal Card Component ---
function GoalCard({ goal }: { goal: GoalData }) {
  return (
    <div className="goal-card" data-goal-id={goal.id}>
      <div className="goal-card-header">🎯 Goal Defined</div>
      <div className="goal-card-body">
        <div className="goal-card-field">
          <span className="goal-card-label">Intent</span>
          <span className="goal-card-value">{goal.intent}</span>
        </div>
        <div className="goal-card-field">
          <span className="goal-card-label">Goal</span>
          <span className="goal-card-value">{goal.goal}</span>
        </div>
        <div className="goal-card-field">
          <span className="goal-card-label">Problem</span>
          <span className="goal-card-value">{goal.problemStatement}</span>
        </div>
        <div className="goal-card-field">
          <span className="goal-card-label">Business Value</span>
          <span className="goal-card-value">{goal.businessValue}</span>
        </div>
        <div className="goal-card-field">
          <span className="goal-card-label">Target Outcome</span>
          <span className="goal-card-value">{goal.targetOutcome}</span>
        </div>
        {goal.successCriteria && goal.successCriteria.length > 0 && (
          <div className="goal-card-field">
            <span className="goal-card-label">Success Criteria</span>
            <ul className="goal-card-list">
              {goal.successCriteria.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
        <div className="goal-card-counts">
          <span>Assumptions: {goal.assumptions?.length || 0}</span>
          <span>Constraints: {goal.constraints?.length || 0}</span>
          <span>Risks: {goal.risks?.length || 0}</span>
        </div>
      </div>
    </div>
  );
}

// --- Research Card Component ---
function ResearchCard({ items }: { items: ResearchItem[] }) {
  // Group by category
  const groups: Record<string, ResearchItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  const statusCounts: Record<string, number> = {};
  for (const item of items) {
    const s = item.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  return (
    <div className="research-card">
      <div className="research-card-header">🔬 Research Checklist</div>
      <div className="research-card-body">
        {Object.entries(groups).map(([category, categoryItems]) => (
          <div key={category} className="research-category-group">
            <div className="research-category-header">
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </div>
            {categoryItems.map(item => (
              <div key={item.id} className="research-item">
                <span className={`research-item-status status-${item.status}`}>{item.status}</span>
                <span className="research-item-question">{item.question}</span>
                {item.findings && (
                  <span className="research-item-findings">{item.findings}</span>
                )}
                {item.decision && (
                  <span className="research-item-decision">{escHtml(item.decision)}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="research-card-summary">
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status}>
            {status.charAt(0).toUpperCase() + status.slice(1)}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Milestone Card Component ---
function MilestoneCard({ milestones }: { milestones: MilestoneData[] }) {
  const sorted = [...milestones].sort((a, b) => a.order - b.order);

  const statusCounts: Record<string, number> = {};
  for (const ms of sorted) {
    const s = ms.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // Build lookup for dependency display
  const orderMap = new Map<string, number>();
  for (const ms of sorted) {
    orderMap.set(ms.id, ms.order);
  }

  const formatStatus = (s: string) => {
    if (s === 'in-progress') return 'In Progress';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <div className="milestone-card">
      <div className="milestone-card-header">🗺️ Milestone Plan</div>
      <div className="milestone-card-body">
        {sorted.map(ms => (
          <div key={ms.id} className="milestone-item">
            <span className="milestone-order">#{ms.order}</span>
            <span className="milestone-name">{ms.name}</span>
            <span className={`milestone-status status-${ms.status}`}>{ms.status}</span>
            <span className="milestone-goal">{ms.goal}</span>
            {ms.dependencies && ms.dependencies.length > 0 && (
              <div className="milestone-deps">
                Depends on: {ms.dependencies.map(dep => `#${orderMap.get(dep) || '?'}`).join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="milestone-card-summary">
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status}>{formatStatus(status)}: {count}</span>
        ))}
      </div>
    </div>
  );
}
