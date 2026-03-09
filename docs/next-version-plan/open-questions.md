# Open Questions

## Product questions
- Should the platform create GitHub Projects automatically or optionally?
- Should milestone execution always be sequential?
- Should one milestone be limited to one repository in v1?
- Should users approve milestone plans before issue creation?

## Technical questions
- What is the exact GitHub Copilot coding agent integration path?
- Should orchestration be event-driven, workflow-driven, or hybrid?
- How should review comments be classified and applied safely?
- How should failed issues be retried or escalated?

## Architecture questions
- Cosmos DB or Azure SQL for planning data?
- Entra ID only, or Entra ID plus GitHub OAuth?
- What audit model is required for autonomous actions?
- What permissions are needed to create branches, issues, milestones, and PRs?

## Safety questions
- What actions require human approval?
- When should the system stop autonomous execution?
- How should dependency conflicts between issues be handled?
