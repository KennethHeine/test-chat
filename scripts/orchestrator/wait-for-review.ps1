# Wait for a Copilot code review to complete on a pull request.
# Uses gh CLI to poll the PR reviews.
#
# Usage: ./scripts/orchestrator/wait-for-review.ps1 <owner> <repo> <pr_number>
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

param(
    [Parameter(Mandatory)][string]$Owner,
    [Parameter(Mandatory)][string]$Repo,
    [Parameter(Mandatory)][string]$PR
)

$ErrorActionPreference = 'Stop'

$Interval = if ($env:POLL_INTERVAL) { [int]$env:POLL_INTERVAL } else { 20 }
$Timeout  = if ($env:POLL_TIMEOUT)  { [int]$env:POLL_TIMEOUT }  else { 600 }
$elapsed  = 0

$botLogins = @(
    'copilot-pull-request-reviewer[bot]',
    'copilot-pull-request-review[bot]',
    'github-actions[bot]'
)

Write-Host "⏳ Waiting for Copilot review on ${Owner}/${Repo}#${PR}..."
Write-Host "   Poll interval: ${Interval}s | Timeout: ${Timeout}s"

while ($true) {
    try {
        $reviews = gh api "repos/${Owner}/${Repo}/pulls/${PR}/reviews" --paginate 2>$null | ConvertFrom-Json
        $botReviews = $reviews | Where-Object { $_.user.login -in $botLogins }
    } catch {
        $botReviews = @()
    }

    if ($botReviews -and @($botReviews).Count -gt 0) {
        $count = @($botReviews).Count
        $latest = @($botReviews)[-1]

        Write-Host "✅ Review completed on PR #${PR}"
        Write-Host "   Reviewer: $($latest.user.login)"
        Write-Host "   State: $($latest.state)"
        Write-Host "   Total bot reviews: ${count}"

        # Also get review comment count
        try {
            $comments = gh api "repos/${Owner}/${Repo}/pulls/${PR}/comments" --paginate 2>$null | ConvertFrom-Json
            $commentCount = @($comments).Count
        } catch {
            $commentCount = 0
        }
        Write-Host "   Review comments: ${commentCount}"

        exit 0
    }

    if ($elapsed -ge $Timeout) {
        Write-Host "❌ Timeout: No Copilot review found within ${Timeout}s on PR #${PR}"
        exit 1
    }

    Start-Sleep -Seconds $Interval
    $elapsed += $Interval
    Write-Host "   ... polling (${elapsed}s elapsed)"
}
