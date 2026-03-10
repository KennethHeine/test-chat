# Wait for the Copilot coding agent to finish work on an issue.
# Detects completion via GitHub timeline events:
#   copilot_work_started          — agent is working
#   copilot_work_finished         — agent completed successfully
#   copilot_work_finished_failure — agent failed
#
# Usage: ./scripts/orchestrator/wait-for-agent.ps1 <owner> <repo> <issue_number>
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 1800 = 30 min)
#
# Exit codes:
#   0 - agent completed successfully
#   1 - timeout, agent failure, or error

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
    # Step 1: Find the PR linked to this issue via cross-reference events
    try {
        $issueTimeline = gh api "repos/${Owner}/${Repo}/issues/${Issue}/timeline" --paginate 2>$null | ConvertFrom-Json
        $prNumber = ($issueTimeline |
            Where-Object { $_.event -eq 'cross-referenced' -and $_.source.issue.pull_request } |
            Select-Object -Last 1
        ).source.issue.number
    } catch {
        $prNumber = $null
    }

    if ($prNumber) {
        # Step 2: Check the PR timeline for Copilot work events
        try {
            $prTimeline = gh api "repos/${Owner}/${Repo}/issues/${prNumber}/timeline" --paginate 2>$null | ConvertFrom-Json
            $latestCopilotEvent = ($prTimeline |
                Where-Object { $_.event -in @('copilot_work_started', 'copilot_work_finished', 'copilot_work_finished_failure') } |
                Select-Object -Last 1
            )
        } catch {
            $latestCopilotEvent = $null
        }

        if ($latestCopilotEvent) {
            switch ($latestCopilotEvent.event) {
                'copilot_work_finished' {
                    Write-Host "✅ Copilot agent finished work on issue #${Issue} (PR #${prNumber})"
                    exit 0
                }
                'copilot_work_finished_failure' {
                    Write-Host "❌ Copilot agent failed on issue #${Issue} (PR #${prNumber})"
                    exit 1
                }
                'copilot_work_started' {
                    Write-Host "   ... agent is working on issue #${Issue} (PR #${prNumber})"
                }
            }
        } else {
            Write-Host "   ... PR #${prNumber} found but no Copilot work events yet"
        }
    } else {
        Write-Host "   ... no PR linked to issue #${Issue} yet"
    }

    if ($elapsed -ge $Timeout) {
        Write-Host "❌ Timeout: Copilot agent did not complete within ${Timeout}s on issue #${Issue}"
        exit 1
    }

    Start-Sleep -Seconds $Interval
    $elapsed += $Interval
    Write-Host "   ... polling (${elapsed}s elapsed)"
}
