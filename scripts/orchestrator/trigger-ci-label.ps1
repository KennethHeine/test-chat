# Add CI trigger labels to a pull request and wait for the resulting workflow runs to complete.
# Uses gh CLI to add labels and poll for workflow completion.
#
# Usage: ./scripts/orchestrator/trigger-ci-label.ps1 <owner> <repo> <pr_number> [--ephemeral] [--e2e] [--all]
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

param(
    [Parameter(Mandatory)][string]$Owner,
    [Parameter(Mandatory)][string]$Repo,
    [Parameter(Mandatory)][string]$PR,
    [switch]$Ephemeral,
    [switch]$E2e,
    [switch]$All
)

$ErrorActionPreference = 'Stop'

$Interval = if ($env:POLL_INTERVAL) { [int]$env:POLL_INTERVAL } else { 20 }
$Timeout  = if ($env:POLL_TIMEOUT)  { [int]$env:POLL_TIMEOUT }  else { 1200 }

# Default: add both labels if no flags specified
if (-not $Ephemeral -and -not $E2e -and -not $All) {
    $All = $true
}
if ($All) {
    $Ephemeral = $true
    $E2e = $true
}

# Get the PR's head branch for workflow run filtering
$prBranch = gh pr view $PR --repo "${Owner}/${Repo}" --json headRefName --jq '.headRefName' 2>$null
if (-not $prBranch) {
    Write-Host "❌ Could not determine head branch for PR #${PR}"
    exit 1
}

Write-Host "🏷️  Adding CI labels to ${Owner}/${Repo}#${PR} (branch: ${prBranch})"

# Record the start time BEFORE adding labels (must be [DateTime] UTC, not a string,
# because ConvertFrom-Json parses dates as DateTime Kind=Utc and PowerShell
# casts ISO-8601 strings to Kind=Local — mixing Kinds breaks -ge comparison).
$startTime = (Get-Date).ToUniversalTime()

$workflows = @()

if ($E2e) {
    Write-Host "   Adding label: run-e2e"
    gh pr edit $PR --repo "${Owner}/${Repo}" --add-label "run-e2e" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ Failed to add run-e2e label — ensure the label exists in the repo"
        exit 1
    }
    $workflows += 'e2e-local.yml'
}

if ($Ephemeral) {
    Write-Host "   Adding label: deploy-ephemeral"
    gh pr edit $PR --repo "${Owner}/${Repo}" --add-label "deploy-ephemeral" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ Failed to add deploy-ephemeral label — ensure the label exists in the repo"
        exit 1
    }
    $workflows += 'deploy-ephemeral.yml'
}

if ($workflows.Count -eq 0) {
    Write-Host "❌ No workflows to wait for"
    exit 1
}

# Short delay to let GitHub register the runs
Start-Sleep -Seconds 10

Write-Host "⏳ Waiting for $($workflows.Count) workflow(s) to complete..."
Write-Host "   Poll interval: ${Interval}s | Timeout: ${Timeout}s"

$elapsed = 0

while ($true) {
    $allDone = $true
    $anyFailed = $false
    $failedRuns = @()

    foreach ($wf in $workflows) {
        try {
            $runs = gh run list --repo "${Owner}/${Repo}" --workflow $wf --branch $prBranch --limit 5 --json databaseId,status,conclusion,createdAt 2>$null | ConvertFrom-Json
            $recent = $runs | Where-Object { $_.conclusion -ne 'skipped' -and $_.createdAt -ge $startTime } | Select-Object -First 1
        } catch {
            $recent = $null
        }

        if (-not $recent) {
            $allDone = $false
            continue
        }

        if ($recent.status -ne 'completed') {
            $allDone = $false
        } elseif ($recent.conclusion -ne 'success') {
            $anyFailed = $true
            $failedRuns += "${wf}(run:$($recent.databaseId))"
        }
    }

    if ($allDone) {
        if ($anyFailed) {
            Write-Host ""
            Write-Host "❌ CI failed! The following workflows did not succeed:"
            Write-Host "   $($failedRuns -join ', ')"
            Write-Host ""
            Write-Host "   Use get-ci-failure-summary.ps1 to get error details for each failing run."
            exit 1
        } else {
            Write-Host ""
            Write-Host "✅ All $($workflows.Count) workflow(s) completed successfully!"
            exit 0
        }
    }

    if ($elapsed -ge $Timeout) {
        Write-Host ""
        Write-Host "❌ Timeout: Workflows did not complete within ${Timeout}s"
        exit 2
    }

    Start-Sleep -Seconds $Interval
    $elapsed += $Interval
    Write-Host "   ... polling (${elapsed}s elapsed)"
}
