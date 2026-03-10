#!/usr/bin/env bash
# Get a summary of failures from a GitHub Actions workflow run.
# Finds failing jobs and extracts relevant log lines.
#
# Usage: ./scripts/orchestrator/get-ci-failure-summary.sh <owner> <repo> <run_id>
#
# Exit codes:
#   0 - summary generated (even if the run passed)
#   1 - error fetching data
#
# Output: formatted summary suitable for posting as a @copilot comment

set -euo pipefail

OWNER="${1:?Usage: get-ci-failure-summary.sh <owner> <repo> <run_id>}"
REPO="${2:?Usage: get-ci-failure-summary.sh <owner> <repo> <run_id>}"
RUN_ID="${3:?Usage: get-ci-failure-summary.sh <owner> <repo> <run_id>}"

RUN_URL="https://github.com/${OWNER}/${REPO}/actions/runs/${RUN_ID}"

echo "📋 Fetching failure summary for run ${RUN_ID}..."

# Get the run details (no standalone jq needed — uses gh --jq)
run_info=$(gh api "repos/${OWNER}/${REPO}/actions/runs/${RUN_ID}" --jq '[.status, .conclusion, .name] | join("|")' 2>/dev/null || {
  echo "❌ Failed to fetch run ${RUN_ID}"
  exit 1
})

IFS='|' read -r run_status run_conclusion run_name <<< "$run_info"

echo "   Workflow: ${run_name}"
echo "   Status: ${run_status} | Conclusion: ${run_conclusion}"
echo ""

if [ "$run_conclusion" = "success" ]; then
  echo "✅ Run ${RUN_ID} succeeded — no failures to report."
  exit 0
fi

# Get count of failing jobs (no standalone jq needed)
failing_job_count=$(gh api "repos/${OWNER}/${REPO}/actions/runs/${RUN_ID}/jobs" --jq '[.jobs[] | select(.conclusion == "failure")] | length' 2>/dev/null || echo "0")

if [ "$failing_job_count" = "0" ]; then
  echo "⚠️  No failing jobs found in run ${RUN_ID} (conclusion: ${run_conclusion})"
  exit 0
fi

# Build the summary
echo "---"
echo ""
echo "@copilot The CI workflow failed. Please investigate and fix the issue."
echo ""
echo "**Failing workflow run:** ${RUN_URL}"
echo ""
echo "**Failing jobs:**"
echo ""

gh api "repos/${OWNER}/${REPO}/actions/runs/${RUN_ID}/jobs" --jq '.jobs[] | select(.conclusion == "failure") | "- **\(.name)** (job ID: \(.id))"' 2>/dev/null

echo ""
echo "**Error details:**"
echo ""

# Get failed job logs using gh run view which handles log formatting properly
echo '```'
gh run view "${RUN_ID}" --repo "${OWNER}/${REPO}" --log-failed 2>/dev/null | tail -80 || echo "(failed to fetch logs for run ${RUN_ID})"
echo '```'

echo "---"
echo ""
echo "Check the workflow logs above and apply fixes to resolve the failures."
