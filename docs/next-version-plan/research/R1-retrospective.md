# R1 Research Retrospective

> **Research item:** R1 — GitHub REST API for Write Operations  
> **Date:** 2026-03-11  
> **Estimated effort:** 2-4 hours  
> **Actual effort:** ~30 minutes  
> **Method:** Sub-agent delegation with structured prompts

---

## What Went Well

### 1. Sub-agent delegation saved significant context
- Each API endpoint was researched by a dedicated sub-agent that returned **only** the structured data needed
- The main conversation stayed focused on orchestration rather than accumulating raw API docs
- 5 endpoint researches ran **in parallel**, collapsing wall-clock time

### 2. Structured prompts produced consistent output
- Every sub-agent received the same output template (endpoint, params, example, response, scopes, errors)
- This made the results directly comparable and easy to compile into the final doc
- No back-and-forth was needed — first-pass results were usable

### 3. Starting with codebase review was essential
- Reading `tools.ts` first revealed the `githubFetch()` pattern and existing tool structure
- This gave context for what the research needed to answer (how to extend the existing pattern)
- The final doc includes a concrete `githubWrite()` helper proposal because of this context

### 4. Batching related research items
- Rate limits and error handling were batched as a second parallel pair
- These cross-cutting concerns applied to all endpoints, so researching them separately was cleaner

---

## What Could Be Improved

### 1. Could have validated with live API calls
- All data came from documentation, not actual API testing
- A future iteration could include a sub-agent that makes test curl requests against a real repo
- This would catch undocumented behaviors (e.g., silent field drops without push access)

### 2. PAT scope verification was documentation-only
- The research says "Issues: write" and "Contents: write" are sufficient
- Ideally, this should be verified by creating a test fine-grained PAT with only those scopes

### 3. No exploration of edge cases
- What happens with very long issue bodies? (There may be a character limit)
- What happens when creating 100+ labels at once? (May hit secondary limits differently)
- These edge cases would matter at scale but aren't blocking for MVP

### 4. GraphQL alternatives not explored
- Some operations (like batch-creating multiple issues) might be more efficient via GraphQL
- This wasn't in scope for R1 but could be worth noting for R2

---

## Key Findings

1. **All needed endpoints exist** as standard REST API — no GraphQL required for R1 operations
2. **Only 2 PAT permissions needed**: Issues (write) + Contents (write)
3. **Labels return 422 on duplicate** with `already_exists` code — handle idempotently
4. **Branch creation is 2-step**: get base SHA, then create ref
5. **labels/assignees on update REPLACE** entirely — must include full desired set
6. **Silent failures** when lacking push access — always verify response matches expectations
7. **Rate limits are generous** for typical planning exports (~40 requests is well within bounds)
8. **The existing `githubFetch()` needs only a small extension** — add method + body support

---

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 7 (5 endpoint + 2 cross-cutting) |
| Parallel batches | 2 (batch of 5, then batch of 2) |
| Sequential steps | 3 (read codebase → research endpoints → compile docs) |
| Files created | 2 (research doc + this retro) |
| Total tool calls | ~12 |
| Context efficiency | High — sub-agent results were concise, no raw HTML/docs in main context |

---

## Recommendations for Next Research Items

1. **R4 (Copilot coding agent API)** — Use same sub-agent pattern but expect less structured results since the API surface may not be fully documented
2. **R3 (Web app → orchestration bridge)** — This is an architecture decision, not pure API research. May need a different approach: research options first, then evaluate trade-offs
3. **R2 (GitHub Projects v2 GraphQL)** — GraphQL mutations are more complex. Sub-agents should include the full mutation syntax with variables
