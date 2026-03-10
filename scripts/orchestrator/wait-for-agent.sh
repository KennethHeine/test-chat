#!/usr/bin/env bash
# Wait for the Copilot coding agent to finish work on an issue.
# Detects completion via GitHub timeline events:
#   copilot_work_started          — agent is working
#   copilot_work_finished         — agent completed successfully
#   copilot_work_finished_failure — agent failed
#
# Usage: ./scripts/orchestrator/wait-for-agent.sh <owner> <repo> <issue_number>
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 1800 = 30 min)
#
# Exit codes:
#   0 - agent completed successfully
#   1 - timeout, agent failure, or error

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
  # Step 1: Find the PR linked to this issue via cross-reference events
  pr_number=$(gh api "repos/${OWNER}/${REPO}/issues/${ISSUE}/timeline" --paginate --jq '
    [.[] | select(.event == "cross-referenced" and .source.issue.pull_request != null) | .source.issue.number] | last
  ' 2>/dev/null || echo "")

  if [ -n "$pr_number" ] && [ "$pr_number" != "null" ]; then
    # Step 2: Check the PR timeline for Copilot work events
    copilot_event=$(gh api "repos/${OWNER}/${REPO}/issues/${pr_number}/timeline" --paginate --jq '
      [.[] | select(.event == "copilot_work_started" or .event == "copilot_work_finished" or .event == "copilot_work_finished_failure")] | last | .event // empty
    ' 2>/dev/null || echo "")

    case "$copilot_event" in
      copilot_work_finished)
        echo "✅ Copilot agent finished work on issue #${ISSUE} (PR #${pr_number})"
        exit 0
        ;;
      copilot_work_finished_failure)
        echo "❌ Copilot agent failed on issue #${ISSUE} (PR #${pr_number})"
        exit 1
        ;;
      copilot_work_started)
        echo "   ... agent is working on issue #${ISSUE} (PR #${pr_number})"
        ;;
      *)
        echo "   ... PR #${pr_number} found but no Copilot work events yet"
        ;;
    esac
  else
    echo "   ... no PR linked to issue #${ISSUE} yet"
  fi

  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "❌ Timeout: Copilot agent did not complete within ${TIMEOUT}s on issue #${ISSUE}"
    exit 1
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  echo "   ... polling (${elapsed}s elapsed)"
done
