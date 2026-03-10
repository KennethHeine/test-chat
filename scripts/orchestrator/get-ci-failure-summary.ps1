# Get a summary of failures from a GitHub Actions workflow run.
# Finds failing jobs and extracts relevant log lines.
#
# Usage: ./scripts/orchestrator/get-ci-failure-summary.ps1 <owner> <repo> <run_id>
#
# Exit codes:
#   0 - summary generated (even if the run passed)
#   1 - error fetching data
#
# Output: formatted summary suitable for posting as a @copilot comment

param(
    [Parameter(Mandatory)][string]$Owner,
    [Parameter(Mandatory)][string]$Repo,
    [Parameter(Mandatory)][string]$RunId
)

$ErrorActionPreference = 'Stop'

$runUrl = "https://github.com/${Owner}/${Repo}/actions/runs/${RunId}"

Write-Host "📋 Fetching failure summary for run ${RunId}..."

try {
    $run = gh api "repos/${Owner}/${Repo}/actions/runs/${RunId}" 2>$null | ConvertFrom-Json
} catch {
    Write-Host "❌ Failed to fetch run ${RunId}"
    exit 1
}

Write-Host "   Workflow: $($run.name)"
Write-Host "   Status: $($run.status) | Conclusion: $($run.conclusion)"
Write-Host ""

if ($run.conclusion -eq 'success') {
    Write-Host "✅ Run ${RunId} succeeded — no failures to report."
    exit 0
}

# Get failing jobs
try {
    $jobsResponse = gh api "repos/${Owner}/${Repo}/actions/runs/${RunId}/jobs" 2>$null | ConvertFrom-Json
    $failingJobs = $jobsResponse.jobs | Where-Object { $_.conclusion -eq 'failure' }
} catch {
    $failingJobs = @()
}

if (-not $failingJobs -or @($failingJobs).Count -eq 0) {
    Write-Host "⚠️  No failing jobs found in run ${RunId} (conclusion: $($run.conclusion))"
    exit 0
}

# Build the summary
Write-Host "---"
Write-Host ""
Write-Host "@copilot The CI workflow failed. Please investigate and fix the issue."
Write-Host ""
Write-Host "**Failing workflow run:** ${runUrl}"
Write-Host ""
Write-Host "**Failing jobs:**"
Write-Host ""

foreach ($job in @($failingJobs)) {
    Write-Host "- **$($job.name)** (job ID: $($job.id))"
}

Write-Host ""
Write-Host "**Error details:**"
Write-Host ""

# Get failed job logs
Write-Host '```'
try {
    $logs = gh run view $RunId --repo "${Owner}/${Repo}" --log-failed 2>$null
    if ($logs) {
        ($logs -split "`n") | Select-Object -Last 80 | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "(no log output for run ${RunId})"
    }
} catch {
    Write-Host "(failed to fetch logs for run ${RunId})"
}
Write-Host '```'

Write-Host "---"
Write-Host ""
Write-Host "Check the workflow logs above and apply fixes to resolve the failures."
