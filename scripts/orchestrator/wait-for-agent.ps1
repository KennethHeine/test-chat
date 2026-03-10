# Wait for the Copilot coding agent to finish work on an issue.
# Uses gh CLI to poll the PR status.
#
# Usage: ./scripts/orchestrator/wait-for-agent.ps1 <owner> <repo> <issue_number>
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 1800 = 30 min)
#
# Exit codes:
#   0 - agent completed successfully (PR is open and non-draft, or already merged/closed)
#   1 - timeout or error

param(
    [Parameter(Mandatory)][string]$Owner,
    [Parameter(Mandatory)][string]$Repo,
    [Parameter(Mandatory)][string]$Issue
)

$ErrorActionPreference = 'Stop'

$Interval = if ($env:POLL_INTERVAL) { [int]$env:POLL_INTERVAL } else { 20 }
$Timeout  = if ($env:POLL_TIMEOUT)  { [int]$env:POLL_TIMEOUT }  else { 1800 }
$elapsed  = 0

Write-Host "⏳ Waiting for Copilot agent to complete on ${Owner}/${Repo}#${Issue}..."
Write-Host "   Poll interval: ${Interval}s | Timeout: ${Timeout}s"

while ($true) {
    # Find PR linked to this issue via timeline cross-references
    try {
        $timeline = gh api "repos/${Owner}/${Repo}/issues/${Issue}/timeline" --paginate 2>$null | ConvertFrom-Json
        $prNumber = ($timeline |
            Where-Object { $_.event -eq 'cross-referenced' -and $_.source.issue.pull_request } |
            Select-Object -Last 1
        ).source.issue.number
    } catch {
        $prNumber = $null
    }

    if ($prNumber) {
        try {
            $pr = gh pr view $prNumber --repo "${Owner}/${Repo}" --json state,isDraft,headRefName 2>$null | ConvertFrom-Json
        } catch {
            $pr = $null
        }

        if ($pr) {
            if ($pr.state -in 'MERGED', 'CLOSED') {
                Write-Host "✅ PR #${prNumber} already $($pr.state) for issue #${Issue}"
                exit 0
            }

            if ($pr.state -eq 'OPEN' -and -not $pr.isDraft) {
                Write-Host "✅ Copilot agent finished — PR #${prNumber} is open and ready for issue #${Issue}"
                Write-Host "   State: $($pr.state)"
                Write-Host "   Head branch: $($pr.headRefName)"
                Write-Host "   Draft: false"
                exit 0
            }

            if ($pr.state -eq 'OPEN' -and $pr.isDraft) {
                Write-Host "   ... PR #${prNumber} exists but is still draft (agent working)"
            }
        }
    }

    if ($elapsed -ge $Timeout) {
        Write-Host "❌ Timeout: Copilot agent did not complete within ${Timeout}s on issue #${Issue}"
        exit 1
    }

    Start-Sleep -Seconds $Interval
    $elapsed += $Interval
    Write-Host "   ... polling (${elapsed}s elapsed)"
}
