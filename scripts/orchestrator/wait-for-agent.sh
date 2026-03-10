#!/usr/bin/env bash
# Wait for the Copilot coding agent to finish work on an issue.
# Uses gh CLI to poll the copilot job status.
#
# Usage: ./scripts/orchestrator/wait-for-agent.sh <owner> <repo> <issue_number>
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 1800 = 30 min)
#
# Exit codes:
#   0 - agent completed successfully
#   1 - timeout or error

set -euo pipefail

OWNER="${1:?Usage: wait-for-agent.sh <owner> <repo> <issue_number>}"
REPO="${2:?Usage: wait-for-agent.sh <owner> <repo> <issue_number>}"
ISSUE="${3:?Usage: wait-for-agent.sh <owner> <repo> <issue_number>}"

INTERVAL="${POLL_INTERVAL:-20}"
TIMEOUT="${POLL_TIMEOUT:-1800}"

elapsed=0

echo "⏳ Waiting for Copilot agent to complete on ${OWNER}/${REPO}#${ISSUE}..."
echo "   Poll interval: ${INTERVAL}s | Timeout: ${TIMEOUT}s"

while true; do
  # Look for a PR that closes this issue by checking the issue timeline for cross-references
  # The coding agent's PR body typically contains "Closes #N" or "Fixes #N"
  pr_number=$(gh api "repos/${OWNER}/${REPO}/issues/${ISSUE}/timeline" --jq '
    [.[] | select(.event == "cross-referenced" and .source.issue.pull_request != null) | .source.issue.number] | last
  ' 2>/dev/null || echo "")

  if [ -n "$pr_number" ] && [ "$pr_number" != "null" ]; then
    # Use gh's built-in --jq to extract fields directly (no standalone jq needed)
    pr_state=$(gh pr view "${pr_number}" --repo "${OWNER}/${REPO}" --json state --jq '.state' 2>/dev/null || echo "")
    pr_draft=$(gh pr view "${pr_number}" --repo "${OWNER}/${REPO}" --json isDraft --jq '.isDraft' 2>/dev/null || echo "")
    pr_head=$(gh pr view "${pr_number}" --repo "${OWNER}/${REPO}" --json headRefName --jq '.headRefName' 2>/dev/null || echo "")

    if [ -n "$pr_state" ]; then
      if [ "$pr_state" = "MERGED" ] || [ "$pr_state" = "CLOSED" ]; then
        echo "✅ PR #${pr_number} already ${pr_state} for issue #${ISSUE}"
        exit 0
      fi

      if [ "$pr_state" = "OPEN" ] && [ "$pr_draft" = "false" ]; then
        echo "✅ Copilot agent finished — PR #${pr_number} is open and ready for issue #${ISSUE}"
        echo "   State: ${pr_state}"
        echo "   Head branch: ${pr_head}"
        echo "   Draft: false"
        exit 0
      fi

      if [ "$pr_state" = "OPEN" ] && [ "$pr_draft" = "true" ]; then
        echo "   ... PR #${pr_number} exists but is still draft (agent working)"
      fi
    fi
  fi

  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "❌ Timeout: Copilot agent did not complete within ${TIMEOUT}s on issue #${ISSUE}"
    exit 1
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  echo "   ... polling (${elapsed}s elapsed)"
done
