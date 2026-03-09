#!/usr/bin/env bash
# Wait for a Copilot code review to complete on a pull request.
# Uses gh CLI to poll the PR reviews.
#
# Usage: ./scripts/orchestrator/wait-for-review.sh <owner> <repo> <pr_number>
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 600 = 10 min)
#
# Exit codes:
#   0 - review completed
#   1 - timeout or error
#
# Output: prints the review state and comment count on success

set -euo pipefail

OWNER="${1:?Usage: wait-for-review.sh <owner> <repo> <pr_number>}"
REPO="${2:?Usage: wait-for-review.sh <owner> <repo> <pr_number>}"
PR="${3:?Usage: wait-for-review.sh <owner> <repo> <pr_number>}"

INTERVAL="${POLL_INTERVAL:-20}"
TIMEOUT="${POLL_TIMEOUT:-600}"

elapsed=0

echo "⏳ Waiting for Copilot review on ${OWNER}/${REPO}#${PR}..."
echo "   Poll interval: ${INTERVAL}s | Timeout: ${TIMEOUT}s"

while true; do
  # Get reviews on the PR, look for one from copilot / github-actions bot
  reviews=$(gh api "repos/${OWNER}/${REPO}/pulls/${PR}/reviews" --jq '[.[] | select(.user.login == "copilot-pull-request-review[bot]" or .user.login == "github-actions[bot]" or .user.type == "Bot")]' 2>/dev/null || echo "[]")

  review_count=$(echo "$reviews" | jq 'length')

  if [ "$review_count" -gt 0 ]; then
    latest_state=$(echo "$reviews" | jq -r '.[-1].state')
    latest_user=$(echo "$reviews" | jq -r '.[-1].user.login')

    echo "✅ Review completed on PR #${PR}"
    echo "   Reviewer: ${latest_user}"
    echo "   State: ${latest_state}"
    echo "   Total bot reviews: ${review_count}"

    # Also get review comment count
    comment_count=$(gh api "repos/${OWNER}/${REPO}/pulls/${PR}/comments" --jq 'length' 2>/dev/null || echo "0")
    echo "   Review comments: ${comment_count}"

    exit 0
  fi

  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "❌ Timeout: No Copilot review found within ${TIMEOUT}s on PR #${PR}"
    exit 1
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  echo "   ... polling (${elapsed}s elapsed)"
done
