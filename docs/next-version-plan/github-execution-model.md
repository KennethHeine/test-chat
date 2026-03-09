# GitHub Execution Model

## Objective
Use GitHub as the operational backend for delivery.

## Milestone branch model
For each milestone, create a dedicated integration branch.

Example:
`prx-milestone-auth-foundation`

This branch is the target branch for all issue-level pull requests within the milestone.

## Issue execution sequence
For each issue in a milestone:

1. Select the next ready issue
2. Assign the issue to GitHub Copilot coding agent
3. Create or update the issue work branch
4. Implement the issue
5. Open a pull request toward the milestone branch
6. Run checks and validations
7. Perform AI-assisted review
8. Process review comments
9. Apply valid fixes
10. Merge into milestone branch
11. Move to the next issue

## Milestone completion flow
When all milestone issues are complete:
1. Validate integrated milestone state
2. Generate milestone summary
3. Open one final PR from the milestone branch to the main branch
4. Review and merge the final milestone PR

## Review loop
The system should support a review cycle where:
- pull requests are reviewed by an AI review step
- comments are classified as valid, optional, or irrelevant
- valid comments are turned into fixes
- fixes are applied before merge

## Benefits
- one integrated branch per milestone
- issue-by-issue control
- better traceability
- cleaner milestone delivery
- lower risk than attempting one large autonomous change at once
