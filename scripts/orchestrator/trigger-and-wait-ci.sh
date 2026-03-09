#!/usr/bin/env bash
# Trigger one or more CI workflows via workflow_dispatch and wait for all to complete.
# Uses gh CLI to trigger and poll workflow runs.
#
# Usage: ./scripts/orchestrator/trigger-and-wait-ci.sh <owner> <repo> <branch> <workflow1> [workflow2...]
#
# Example:
#   ./scripts/orchestrator/trigger-and-wait-ci.sh KennethHeine test-chat feature-branch e2e-local.yml deploy-ephemeral.yml
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 1200 = 20 min)
#
# Exit codes:
#   0 - all workflows completed successfully
#   1 - one or more workflows failed (prints failing run IDs)
#   2 - timeout

set -euo pipefail

OWNER="${1:?Usage: trigger-and-wait-ci.sh <owner> <repo> <branch> <workflow1> [workflow2...]}"
REPO="${2:?Usage: trigger-and-wait-ci.sh <owner> <repo> <branch> <workflow1> [workflow2...]}"
BRANCH="${3:?Usage: trigger-and-wait-ci.sh <owner> <repo> <branch> <workflow1> [workflow2...]}"
shift 3
WORKFLOWS=("$@")

if [ ${#WORKFLOWS[@]} -eq 0 ]; then
  echo "❌ Error: At least one workflow file name is required"
  exit 1
fi

INTERVAL="${POLL_INTERVAL:-20}"
TIMEOUT="${POLL_TIMEOUT:-1200}"

echo "🚀 Triggering ${#WORKFLOWS[@]} workflow(s) on ${OWNER}/${REPO} branch: ${BRANCH}"

# Trigger each workflow
for wf in "${WORKFLOWS[@]}"; do
  echo "   Triggering: ${wf}"
  gh workflow run "${wf}" --repo "${OWNER}/${REPO}" --ref "${BRANCH}" 2>/dev/null || {
    echo "   ⚠️  Failed to trigger ${wf} — it may not have workflow_dispatch enabled"
  }
done

# Short delay to let GitHub register the runs
sleep 5

echo "⏳ Waiting for all workflows to complete..."
echo "   Poll interval: ${INTERVAL}s | Timeout: ${TIMEOUT}s"

elapsed=0

while true; do
  all_done=true
  any_failed=false
  failed_runs=""

  for wf in "${WORKFLOWS[@]}"; do
    # Get the most recent run for this workflow on this branch
    run_json=$(gh run list --repo "${OWNER}/${REPO}" --workflow "${wf}" --branch "${BRANCH}" --limit 1 --json databaseId,status,conclusion,createdAt --jq '.[0]' 2>/dev/null || echo "")

    if [ -z "$run_json" ] || [ "$run_json" = "null" ]; then
      all_done=false
      continue
    fi

    status=$(echo "$run_json" | jq -r '.status')
    conclusion=$(echo "$run_json" | jq -r '.conclusion')
    run_id=$(echo "$run_json" | jq -r '.databaseId')

    if [ "$status" != "completed" ]; then
      all_done=false
    elif [ "$conclusion" != "success" ]; then
      any_failed=true
      failed_runs="${failed_runs} ${wf}(run:${run_id})"
    fi
  done

  if [ "$all_done" = true ]; then
    if [ "$any_failed" = true ]; then
      echo ""
      echo "❌ CI failed! The following workflows did not succeed:"
      echo "   ${failed_runs}"
      echo ""
      echo "   Use get-ci-failure-summary.sh to get error details for each failing run."
      exit 1
    else
      echo ""
      echo "✅ All ${#WORKFLOWS[@]} workflow(s) completed successfully!"
      exit 0
    fi
  fi

  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo ""
    echo "❌ Timeout: Workflows did not complete within ${TIMEOUT}s"
    exit 2
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  echo "   ... polling (${elapsed}s elapsed)"
done
