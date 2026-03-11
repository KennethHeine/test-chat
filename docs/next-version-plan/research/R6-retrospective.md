# R6 Research Retrospective

> **Research item:** R6 — GitHub Copilot SDK — Unused Features  
> **Date:** 2026-03-11  
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **Codebase review first** paid off significantly — discovered that sdk-reference.md Section 8 is largely outdated. Many "unused" features are now in production code (custom tools, hooks, events, system message, session resumption, permission handler). This reframed the entire research from "which features to adopt" to "which *remaining* features to adopt."
- **Sub-agent parallelization** was efficient — 5 independent questions dispatched in the first batch, 2 follow-ups in a second batch. No sequential dependencies between sub-questions.
- **Critical correction found** — `planning.started` and `planning.end` events listed in sdk-reference.md don't exist in the SDK. The real events are `session.mode_changed`, `session.plan_changed`, and `exit_plan_mode.requested`. This prevents implementation bugs.
- **Cross-reference with R3** provided clear architectural guidance — MCP servers are not the right approach for GitHub write operations; native tools are better. This closes a speculative path from the original R6 question.

## What Could Be Improved

- **sdk-reference.md drift** — the document hasn't been updated as features were implemented. A process to keep it current would prevent future researchers from wasting time on already-resolved questions.
- **Sub-agent depth on MCP** — SQ1 could have benefited from a practical test (creating a minimal MCP server and connecting it to a session) rather than purely documentation research. However, the recommendation to skip MCP was clear enough from the analysis.
- **Model list is time-sensitive** — the reasoning effort research relies on a model list that changes frequently. The document notes this but a better approach would be to show how to query capabilities at runtime rather than listing specific models.

## Key Findings

1. **MCP vs native tools: native wins** for this project's use case (direct GitHub REST API integration). MCP is justified only when tools need to be shared across multiple MCP clients.
2. **User input requests** are the highest-value unused feature — they enable structured goal definition with choices, bridged to SSE via a new `/api/chat/input` endpoint and a pending-Promise pattern.
3. **Planning events correction** — `planning.started/end` don't exist. Use `session.mode_changed` + `exit_plan_mode.requested` + `assistant.intent` instead.
4. **Session resumption already works** for same-process scenarios. Docker ephemeral filesystem prevents cross-restart resumption — the pragmatic fix is message replay, not volume mounts.
5. **~85 lines of code** to add planning/intent/subagent/compaction event forwarding to SSE — highest value-per-line feature.
6. **BYOK and custom agents** provide no value at current scale (gpt-4.1 at 0 premium requests; system message covers planning phases).

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 7 |
| Parallel batches | 2 (5 + 2) |
| Files created | 2 (research doc + retrospective) |
| Codebase files reviewed | 6 (server.ts, tools.ts, planning-tools.ts, sdk-reference.md, R3 research, research-needed.md) |
| Key corrections identified | 7 (sdk-reference.md outdated entries) |

## Recommendations for Next Research

- **R10 (MCP Server Architecture)** can be de-prioritized or closed — this R6 research answers the key question: MCP is not the right approach for GitHub write tools in this project.
- **Update sdk-reference.md** Sections 8 and 9 to reflect current implementation state before starting new feature work.
- **User input requests** (SQ2) should be prototyped as a standalone PR to validate the SSE ↔ POST bridging pattern before committing to the full planning integration.
