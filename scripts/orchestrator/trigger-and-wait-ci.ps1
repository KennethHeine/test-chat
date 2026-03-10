# Trigger one or more CI workflows via workflow_dispatch and wait for all to complete.
# Uses gh CLI to trigger and poll workflow runs.
#
# Usage: ./scripts/orchestrator/trigger-and-wait-ci.ps1 <owner> <repo> <branch> <workflow1> [workflow2...]
#
# Example:
#   ./scripts/orchestrator/trigger-and-wait-ci.ps1 KennethHeine test-chat feature-branch e2e-local.yml deploy-ephemeral.yml
#
# Environment:
#   POLL_INTERVAL  - seconds between polls (default: 20)
#   POLL_TIMEOUT   - max seconds to wait (default: 1200 = 20 min)
#
# Exit codes:
#   0 - all workflows completed successfully
#   1 - one or more workflows failed (prints failing run IDs)
#   2 - timeout

param(
    [Parameter(Mandatory)][string]$Owner,
    [Parameter(Mandatory)][string]$Repo,
    [Parameter(Mandatory)][string]$Branch,
    [Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Workflows
)

$ErrorActionPreference = 'Stop'

if ($Workflows.Count -eq 0) {
    Write-Host "❌ Error: At least one workflow file name is required"
    exit 1
}

$Interval = if ($env:POLL_INTERVAL) { [int]$env:POLL_INTERVAL } else { 20 }
$Timeout  = if ($env:POLL_TIMEOUT)  { [int]$env:POLL_TIMEOUT }  else { 1200 }

Write-Host "🚀 Triggering $($Workflows.Count) workflow(s) on ${Owner}/${Repo} branch: ${Branch}"

# Record start time BEFORE triggering
$startTime = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# Trigger each workflow
foreach ($wf in $Workflows) {
    Write-Host "   Triggering: ${wf}"
    gh workflow run $wf --repo "${Owner}/${Repo}" --ref $Branch 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ⚠️  Failed to trigger ${wf} — it may not have workflow_dispatch enabled"
    }
}

# Short delay to let GitHub register the runs
Start-Sleep -Seconds 5

Write-Host "⏳ Waiting for all workflows to complete..."
Write-Host "   Poll interval: ${Interval}s | Timeout: ${Timeout}s"

$elapsed = 0

while ($true) {
    $allDone = $true
    $anyFailed = $false
    $failedRuns = @()

    foreach ($wf in $Workflows) {
        try {
            $runs = gh run list --repo "${Owner}/${Repo}" --workflow $wf --branch $Branch --limit 5 --json databaseId,status,conclusion,createdAt 2>$null | ConvertFrom-Json
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
            Write-Host "✅ All $($Workflows.Count) workflow(s) completed successfully!"
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
