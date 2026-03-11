# Research Process Guide

> Reusable process for conducting technical research using AI sub-agents.  
> Proven on R1 (GitHub REST API for Write Operations). Apply to R2–R10 and future research.

---

## Overview

This process uses **sub-agent delegation** to research technical topics efficiently. The main agent orchestrates, while sub-agents fetch specific data and return only what's needed. This keeps context lean and allows parallel execution.

---

## Phase 1: Scope & Prepare

**Goal:** Understand what the research needs to answer and what context exists.

### Steps

1. **Read the research item** — understand the question, why it matters, and what decisions it unblocks
2. **Review existing codebase** — read relevant source files to understand current patterns and constraints
3. **Decompose into sub-questions** — break the research into independent, specific questions that can be answered in parallel
4. **Define output format** — decide what structured data each sub-question should return

### Checklist

- [ ] Research question is clear and specific
- [ ] Existing codebase patterns reviewed
- [ ] Sub-questions identified (aim for 3–7)
- [ ] Output template defined for each sub-question

### Tips

- Start with the codebase, not the docs. Understanding what you're integrating with shapes better questions.
- Each sub-question should be answerable independently (no dependencies between them).
- Define the output format before dispatching — this prevents getting unfocused results.

---

## Phase 2: Research (Sub-Agent Dispatch)

**Goal:** Gather all needed data through parallel sub-agent calls.

### Steps

1. **Write structured prompts** for each sub-agent:
   - State exactly what to research (include URLs to documentation if known)
   - Specify the exact output format (numbered sections, tables, code examples)
   - Say "Return ONLY the following structured data (no extra commentary)"
   - Include specific fields to extract (don't leave it open-ended)

2. **Batch independent queries** — dispatch all sub-agents that don't depend on each other simultaneously

3. **Review results** — check that each sub-agent returned the requested format and data

4. **Fill gaps** — if any sub-agent missed key data, dispatch a targeted follow-up

### Prompt Template

```
Research [TOPIC]. Fetch [SPECIFIC URL OR SOURCE].

Return ONLY the following structured data (no extra commentary):

1. **[Section 1]**: [What to include]
2. **[Section 2]**: [What to include]
3. **[Section 3]**: [What to include]
...

Keep the response concise and structured. No filler text.
```

### Batching Strategy

| Batch | Contents | Dependency |
|-------|----------|------------|
| 1 | All independent endpoint/feature researches | None |
| 2 | Cross-cutting concerns (rate limits, auth, errors) | May use batch 1 context |
| 3 | Gap-filling follow-ups | Depends on batch 1-2 results |

### Tips

- Max 5–7 sub-agents per batch for manageability
- Each sub-agent should return < 500 words of structured data
- Use tables for comparative data (parameters, options, status codes)
- Include code examples — they're more useful than prose descriptions

---

## Phase 3: Synthesize & Document

**Goal:** Compile sub-agent results into a single, actionable research document.

### Steps

1. **Create the research doc** with these sections:
   - **Status & metadata** (date, status, what it blocks)
   - **Summary table** (quick reference for all findings)
   - **Detailed sections** (one per sub-question, compiled from sub-agent data)
   - **Integration notes** (how findings connect to existing codebase)
   - **Decision / next steps** (what this enables, what to build)

2. **Cross-reference** — look for patterns across sub-agent results (shared PAT scopes, common error codes, etc.)

3. **Identify gaps** — note anything the research couldn't answer and why

### Document Template

```markdown
# R[N]: [Title]

> **Status:** COMPLETE | PARTIAL | BLOCKED  
> **Date:** YYYY-MM-DD  
> **Blocks:** [What stage/decision this unblocks]  
> **Summary:** [1-2 sentence finding]

---

## Endpoints/Features Summary
[Quick reference table]

## [Section per sub-question]
[Compiled from sub-agent results]

## Integration with Existing Codebase
[How to integrate — patterns, helpers, changes needed]

## Decision: [Ready for Implementation | Needs More Research | Architecture Decision Required]
[What to do next]
```

---

## Phase 4: Retrospective

**Goal:** Capture what worked, what didn't, and how to improve the process.

### Steps

1. **Write a brief retro** covering:
   - What went well (methods that worked)
   - What could be improved (gaps, inefficiencies)
   - Key findings (surprises, important discoveries)
   - Process metrics (sub-agents dispatched, batches, time estimate vs actual)
   - Recommendations for next research items

2. **Update this process doc** if the retro reveals improvements

### Retro Template

```markdown
# R[N] Research Retrospective

> **Research item:** [Title]  
> **Estimated effort:** [From research-needed.md]  
> **Actual effort:** [How long it actually took]

## What Went Well
## What Could Be Improved
## Key Findings
## Process Metrics
## Recommendations for Next Research
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do Instead |
|-------------|-------------|-----------|
| Dumping raw docs into context | Blows up context window, most content irrelevant | Use sub-agents to extract only needed data |
| One giant sub-agent prompt | Returns unfocused, verbose results | Split into specific sub-questions |
| Sequential sub-agent calls | Wastes time on independent questions | Batch independent calls in parallel |
| No output format specified | Sub-agent guesses what to return | Always define structured output template |
| Skipping codebase review | Research may not match existing patterns | Always read existing code first |
| No retrospective | Same mistakes repeated | Always write a brief retro |

---

## When to Deviate from This Process

- **Architecture decisions** (like R3): Research options first, then make a trade-off table. The "sub-question" model doesn't work well for open-ended design questions.
- **Undocumented APIs** (like R4): May need exploratory research instead of structured extraction. Accept that results will be less certain.
- **Live testing needed**: When docs aren't trustworthy, add a sub-agent step that writes curl commands or test scripts to validate against a real environment.

---

## Quick Reference: Research Workflow

```
1. Read research item from research-needed.md
2. Review relevant source files in codebase
3. Decompose into 3-7 independent sub-questions
4. Define output template for each
5. Dispatch sub-agents in parallel batches
6. Review results, fill gaps with follow-up batch
7. Compile into research doc (docs/next-version-plan/research/R[N]-*.md)
8. Write retrospective (docs/next-version-plan/research/R[N]-retrospective.md)
9. Update research-needed.md status if applicable
```
