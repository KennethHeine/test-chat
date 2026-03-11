# R3 Research Retrospective

> **Research item:** R3 — How to Bridge Web App → Agent Orchestration  
> **Date:** 2026-03-11  
> **Estimated effort:** 6-8 hours  
> **Actual effort:** ~45 minutes  
> **Method:** Sub-agent delegation with structured prompts + web fetching

---

## What Went Well

### 1. Web fetching found the critical missing piece

The codebase and internal docs all stated that `assign_copilot_to_issue` was MCP-only. A web fetch of the current GitHub docs revealed that GitHub has since published **public REST and GraphQL APIs** for Copilot coding agent assignment. This single finding eliminated the need for Option B (Actions bridge) and Option C (Hybrid), dramatically simplifying the architecture.

Without the web fetch, the research would have concluded that Option A was impossible — which would have been wrong.

### 2. Starting with codebase review shaped the right questions

Reading `server.ts`, `tools.ts`, `issue-lifecycle.agent.md`, and existing scripts revealed:
- The exact polling patterns that need to be translated to TypeScript
- The SSE infrastructure that can be reused for execution progress
- The permission handler pattern for gating new tools
- The `githubFetch()` pattern that extends naturally to write operations

### 3. Sub-agent delegation kept context clean

Five sub-agents handled independent research areas:
- Copilot agent assignment API (codebase search)
- SDK MCP server integration (codebase search)
- Workflow dispatch API (codebase search)
- Real-time progress patterns (codebase search)
- Copilot review request API (codebase search)

Each returned structured data that was easy to synthesize without polluting the main context.

### 4. Parallel dispatch was effective

Independent codebase exploration sub-agents ran simultaneously, and web fetches targeted specific documentation pages.

---

## What Could Be Improved

### 1. Should have started with web fetching earlier

The sub-agents spent time searching the codebase for evidence of REST APIs that didn't exist there. If the first action had been fetching the current GitHub docs, the research would have been faster and the sub-agents could have been more targeted.

**Lesson:** When research involves external APIs, check the official docs first before doing deep codebase searches.

### 2. No live API testing

All findings are based on documentation. The REST API endpoints should be tested with actual API calls before implementation:
- Does `copilot-swe-agent[bot]` work as an assignee with fine-grained PATs?
- What exact reviewer identity string triggers Copilot code review?
- Does the `agent_assignment` field work on all endpoint variants?

### 3. Copilot code review request identity is uncertain

The docs show that Copilot is selected from the "Reviewers" menu, which maps to `POST .../requested_reviewers`. But the exact string to pass (bot login? team slug?) was not confirmed with certainty from docs alone. This needs live testing.

### 4. R4 was partially answered but not documented separately

The Copilot coding agent API surface (R4) was effectively answered within R3. Consider whether to create a separate R4 document or mark R4 as "resolved by R3."

---

## Key Findings

1. **GitHub has public REST APIs for Copilot coding agent assignment** — `copilot-swe-agent[bot]` is the bot login, used with standard issue assignee endpoints plus an `agent_assignment` body parameter
2. **Option A (direct REST API) is viable and recommended** — the web app can orchestrate the entire execution loop without GitHub Actions as a bridge
3. **Copilot code review uses standard review request API** — select Copilot from reviewers, same as human reviewers
4. **All monitoring patterns already exist** in the codebase (`wait-for-agent.ps1`, `wait-for-review.ps1`) and translate directly to TypeScript
5. **MCP server bridge is unnecessary** — the SDK's `mcpServers` feature is technically feasible but adds complexity that isn't needed now that REST API is available
6. **PAT permissions need upgrading** — users need actions, contents, issues, and pull_requests read+write

---

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 5 (codebase exploration) |
| Web page fetches | 4 (GitHub docs) |
| Parallel batches | 3 (initial codebase, follow-up web fetch, final web fetch) |
| Files created | 2 (research doc + retrospective) |
| Codebase files read | server.ts, tools.ts, planning-tools.ts, issue-lifecycle.agent.md, orchestrator.agent.md, agent-orchestration-process.md, sdk-reference.md, project-plan-v2.md, R1 research, R1 retrospective |

---

## Recommendations for Next Research

1. **R4 can likely be marked as resolved** — the Copilot coding agent API surface was fully documented in R3. Create a brief R4 doc that cross-references R3 findings, or update `research-needed.md` to note R4 is answered.
2. **R5 (persistent storage) becomes more urgent** — Option A requires execution state persistence for crash recovery. Prioritize R5 next.
3. **Live API testing should be a follow-up** — before implementing Stage 5, test the Copilot assignment and review request endpoints with actual API calls against a real repo.
4. **R10 (MCP server) can be deprioritized** — with REST API available, the MCP server bridge is unnecessary. R10 is informational only.
