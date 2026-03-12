interface StatusBarProps {
  statusText: string;
  statusConnected: boolean;
  toolActivity: string;
  toolActivityVisible: boolean;
  agentStatus: string;
  agentStatusVisible: boolean;
  usageText: string;
  usageVisible: boolean;
  quotaText: string;
  quotaVisible: boolean;
}

export default function StatusBar({
  statusText,
  statusConnected,
  toolActivity,
  toolActivityVisible,
  agentStatus,
  agentStatusVisible,
  usageText,
  usageVisible,
  quotaText,
  quotaVisible,
}: StatusBarProps) {
  return (
    <div id="status-bar">
      <span className={`status-dot${statusConnected ? '' : ' disconnected'}`} id="status-dot" />
      <span id="status-text">{statusText}</span>
      <span
        id="tool-activity"
        style={{ display: toolActivityVisible ? undefined : 'none', marginLeft: 'auto', color: 'var(--color-accent)' }}
      >
        <span id="tool-activity-text">{toolActivity}</span>
      </span>
      <span
        id="agent-status"
        style={{ display: agentStatusVisible ? undefined : 'none', marginLeft: '8px', color: 'var(--color-text-muted)', fontSize: '11px' }}
      >
        <span id="agent-status-text">{agentStatus}</span>
      </span>
      <span
        id="usage-display"
        style={{ display: usageVisible ? undefined : 'none', marginLeft: '12px', color: 'var(--color-text-muted)', fontSize: '11px' }}
      >
        <span id="usage-text">{usageText}</span>
      </span>
      <span
        id="quota-display"
        style={{ display: quotaVisible ? undefined : 'none', marginLeft: '12px', color: 'var(--color-text-muted)', fontSize: '11px' }}
      >
        <span id="quota-text">{quotaText}</span>
      </span>
    </div>
  );
}
