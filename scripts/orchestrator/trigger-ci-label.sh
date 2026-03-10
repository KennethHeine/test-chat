#!/usr/bin/env bash
# Add CI trigger labels to a pull request and wait for the resulting workflow runs to complete.
# Uses gh CLI to add labels and poll for workflow completion.
#
# Usage: ./scripts/orchestrator/trigger-ci-label.sh <owner> <repo> <pr_number> [--ephemeral] [--e2e]
#
# Flags:
#   --ephemeral  Add the 'deploy-ephemeral' label (triggers deploy + ephemeral E2E)
#   --e2e        Add the 'run-e2e' label (triggers local E2E tests)
#   --all        Add both labels (default if no flags specified)
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 1200 = 20 min)
#
# Exit codes:
#   0 - all triggered workflows completed successfully
#   1 - one or more workflows failed
#   2 - timeout

set -euo pipefail

OWNER="${1:?Usage: trigger-ci-label.sh <owner> <repo> <pr_number> [--ephemeral] [--e2e] [--all]}"
REPO="${2:?Usage: trigger-ci-label.sh <owner> <repo> <pr_number> [--ephemeral] [--e2e] [--all]}"
PR="${3:?Usage: trigger-ci-label.sh <owner> <repo> <pr_number> [--ephemeral] [--e2e] [--all]}"
shift 3

INTERVAL="${POLL_INTERVAL:-20}"
TIMEOUT="${POLL_TIMEOUT:-1200}"

# Parse flags
add_ephemeral=false
add_e2e=false
any_flag=false

for arg in "$@"; do
  case "$arg" in
    --ephemeral) add_ephemeral=true; any_flag=true ;;
    --e2e)       add_e2e=true; any_flag=true ;;
    --all)       add_ephemeral=true; add_e2e=true; any_flag=true ;;
    *) echo "⚠️  Unknown flag: $arg"; exit 1 ;;
  esac
done

# Default: add both labels
if [ "$any_flag" = false ]; then
  add_ephemeral=true
  add_e2e=true
fi

# Get the PR's head branch for workflow run filtering
pr_branch=$(gh pr view "${PR}" --repo "${OWNER}/${REPO}" --json headRefName --jq '.headRefName' 2>&1) || {
  echo "❌ Could not determine head branch for PR #${PR}: ${pr_branch}"
  exit 1
}
if [ -z "$pr_branch" ]; then
  echo "❌ Empty head branch returned for PR #${PR}"
  exit 1
fi

echo "🏷️  Adding CI labels to ${OWNER}/${REPO}#${PR} (branch: ${pr_branch})"

# Record the start time BEFORE adding labels so we don't miss workflow runs
# that start immediately when the label is added
start_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Track which workflows we're waiting for
declare -a WORKFLOWS=()

if [ "$add_e2e" = true ]; then
  echo "   Adding label: run-e2e"
  if ! gh pr edit "${PR}" --repo "${OWNER}/${REPO}" --add-label "run-e2e" 2>/dev/null; then
    echo "   ❌ Failed to add run-e2e label — ensure the label exists in the repo"
    exit 1
  fi
  WORKFLOWS+=("e2e-local.yml")
fi

if [ "$add_ephemeral" = true ]; then
  echo "   Adding label: deploy-ephemeral"
  if ! gh pr edit "${PR}" --repo "${OWNER}/${REPO}" --add-label "deploy-ephemeral" 2>/dev/null; then
    echo "   ❌ Failed to add deploy-ephemeral label — ensure the label exists in the repo"
    exit 1
  fi
  WORKFLOWS+=("deploy-ephemeral.yml")
fi

if [ ${#WORKFLOWS[@]} -eq 0 ]; then
  echo "❌ No workflows to wait for"
  exit 1
fi

# Short delay to let GitHub register the runs
sleep 10

echo "⏳ Waiting for ${#WORKFLOWS[@]} workflow(s) to complete..."
echo "   Poll interval: ${INTERVAL}s | Timeout: ${TIMEOUT}s"

elapsed=0

while true; do
  all_done=true
  any_failed=false
  failed_runs=""

  for wf in "${WORKFLOWS[@]}"; do
    # Get recent runs for this workflow on this branch (no standalone jq needed)
    run_info=$(gh run list --repo "${OWNER}/${REPO}" --workflow "${wf}" --branch "${pr_branch}" --limit 5 --json databaseId,status,conclusion,createdAt --jq "
      [.[] | select(.conclusion != \"skipped\" and .createdAt >= \"${start_time}\")] |
      if length > 0 then .[0] | \"\(.status) \(.conclusion // \"null\") \(.databaseId)\" else \"\" end
    " 2>/dev/null || echo "")

    if [ -z "$run_info" ]; then
      all_done=false
      continue
    fi

    read -r status conclusion run_id <<< "$run_info"

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
