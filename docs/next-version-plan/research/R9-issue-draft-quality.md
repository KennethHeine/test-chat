# R9: IssueDraft Quality — What Makes a Good Coding Agent Issue?

> **Status:** COMPLETE
> **Date:** 2026-03-11
> **Blocks:** Issue 4.6 (generate_issue_drafts tool), Issue 4.7 (update_issue_draft tool), all Stage 5 execution
> **Summary:** High-quality coding agent issues require 6 elements: clear problem statement, explicit file paths, pattern references, scoped boundaries, testable acceptance criteria, and verification commands. The current `IssueDraft` interface is missing structured file references, security checklists, and verification steps — the three fields most correlated with coding agent success.

---

## Findings Summary

| Finding | Source | Impact |
|---------|--------|--------|
| `filesToModify` + `filesToRead` are the most impactful missing IssueDraft fields | SQ1 (template gap analysis), SQ3 (lifecycle analysis), SQ5 (stage 0-3 review) | HIGH — directly determines where the agent works |
| Acceptance criteria must be machine-testable, not prose | SQ2 (GitHub docs), SQ4 (industry practices) | HIGH — vague criteria cause CI loops |
| Security checklist prevents review fix loops | SQ3 (lifecycle analysis), SQ1 (template gaps) | MEDIUM — specific validation rules reduce review iterations |
| Issue scope should be ≤3 hours human-equivalent work | SQ2 (GitHub docs), SQ4 (industry practices) | HIGH — larger issues cause timeouts |
| Research context from resolved items is silently dropped | SQ1 (template gap analysis) | MEDIUM — wastes research effort |
| Pattern references ("follow X.ts") are the strongest predictor of clean first-pass code | SQ5 (stage 0-3 analysis) | HIGH — eliminates architecture/style review comments |

---

## 1. Current IssueDraft vs. Issue Template Gap Analysis

The `IssueDraft` interface in [planning-types.ts](../../../planning-types.ts) and the issue template in [stage-setup.agent.md](../../../.github/agents/stage-setup.agent.md) have significant structural gaps.

### Field Mapping

| Template Section | IssueDraft Field | Status |
|---|---|---|
| Title | `title` | ✅ Match |
| Purpose | `purpose` | ✅ Match |
| Problem to Solve | `problem` | ✅ Match (template derives; IssueDraft stores) |
| Expected Outcome | `expectedOutcome` | ✅ Match |
| Scope Boundaries | `scopeBoundaries` | ✅ Match |
| Technical Context — Files to modify | *(missing)* | ❌ **Critical gap** |
| Technical Context — Files to read | *(missing)* | ❌ **Critical gap** |
| Patterns to follow | *(missing)* | ❌ Gap (hardcoded in template) |
| Acceptance Criteria | `acceptanceCriteria` | ✅ Match |
| Testing Expectations | `testingExpectations` | ✅ Match |
| Security Checklist | *(missing)* | ❌ Gap |
| Documentation Standards | *(missing)* | ⚠️ Minor gap |
| Parent Context (stage/branch) | `milestoneId` + `order` | ⚠️ Partial (requires join) |
| Dependencies | `dependencies` | ✅ Match |
| Research Context | `researchLinks` | ❌ Gap — template has no slot for this |

### Missing from IssueDraft (template has them)

- **`filesToModify`** — structured list of files + purpose. The agent needs to know WHERE to work.
- **`filesToRead`** — context files the agent should read first.
- **Security checklist items** — specific validation rules per issue, not generic checkboxes.
- **Documentation impact** — which docs need updating.

### Missing from Template (IssueDraft has them)

- **`researchLinks`** — research findings relevant to the issue. Template silently drops this.

---

## 2. GitHub's Official Recommendations

GitHub's Copilot coding agent documentation identifies three essential issue components:

### The Three Essentials

1. **Clear problem description** — describe the problem or work required (maps to `purpose` + `problem`)
2. **Complete acceptance criteria** — specify what "done" looks like, including whether tests are needed (maps to `acceptanceCriteria`)
3. **File/directory hints** — point to specific files that need to change (maps to **missing** `filesToModify`)

### Recommended Issue Scope

| Good For Copilot | Avoid Assigning |
|---|---|
| Fix bugs | Broad-scoped refactoring |
| Alter UI features | Complex legacy code understanding |
| Improve test coverage | Deep domain knowledge required |
| Update documentation | Large changes requiring design consistency |
| Address technical debt | Production-critical / security-sensitive |
| Config file updates | Ambiguous tasks lacking clear definition |

### Agent Context Model

- **Receives:** issue title + description + comments at assignment time + optional custom instructions
- **Reads automatically:** `AGENTS.md`, `.github/copilot-instructions.md`, configured MCP servers
- **Does NOT react to** comments added after assignment — use PR comments instead
- **Supports:** image attachments (screenshots, mockups)

---

## 3. Failure Mode Analysis (from Issue-Lifecycle Agent)

The orchestration system has three escalation triggers, each directly related to issue quality:

### Escalation Thresholds

| Trigger | Threshold | Root Cause |
|---------|-----------|-----------|
| Review fix loop | `reviewFixAttempts >= 3` | Issue lacked specific validation rules or pattern references |
| CI fix loop | `ciFixAttempts >= 3` | Issue lacked test commands or expected type signatures |
| Agent timeout | 30min initial + 60min extended | Issue scope too large or too ambiguous |

### Failure Mode → Issue Quality Fix

| Failure Mode | Cause | Issue Quality Fix |
|---|---|---|
| Agent timeout | Issue too large or ambiguous | Break into smaller issues; add explicit file paths |
| Review fixes (validation) | Missing input validation rules | Security Checklist with specific per-input rules |
| Review fixes (style) | Agent invents new patterns | Reference existing file: "follow pattern in X.ts" |
| CI failure (types) | Missing type signatures | Include expected function signatures in technical context |
| CI failure (tests) | No test expectations | Include exact test commands and expected coverage |
| Repeated loops → escalated | Fixes introduce new issues | Provide more context; tighter scope boundaries |

---

## 4. Industry Best Practices

Cross-agent platform research (GitHub Copilot, Devin, Claude Code) reveals converging patterns:

### Universal Principles

| Principle | Why It Matters |
|---|---|
| **Explicit success criteria** | Agents need verifiable completion signals |
| **Reference existing patterns** | Agents learn from codebase faster than abstract description |
| **Actionable specificity** | Name specific files, routes, components |
| **Scoped task size** | ≤3 hour human-equivalent |
| **Verification built-in** | Agents need self-check commands |

### The Goldilocks Zone of Context

| Always Include | Exclude (Noise) |
|---|---|
| File paths and component names | Architecture tutorials |
| Existing patterns to follow | Standard language conventions |
| Test commands and expected outputs | File-by-file codebase descriptions |
| Data sources (DB tables, APIs) | Subjective quality criteria ("make it clean") |
| Exact error messages (for bugs) | Unrelated project history |

### Common Anti-Patterns

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| "Make it better" | No completion criteria | Specify exact changes |
| "Build a new architecture" | Too large, too many decisions | Break into scoped sub-tasks |
| Over-specifying implementation | Agent ignores or conflicts | Specify *what* and *where*, not *how* |
| No verification step | Plausible but broken code | Always include test commands |
| No pattern reference | Agent invents new style | Point to existing file as template |

---

## 5. Pattern Analysis: Completed Issues (Stages 0–3)

### Quality Assessment of 12 Completed Issues

| Issue # | Title | File Context | Pattern Ref | Testable Criteria | Assessment |
|---|---|---|---|---|---|
| 1 | Define planning data model interfaces | ✅ Named file | ❌ None | ⚠️ Partial | Good scope, missing field specs |
| 2 | Implement InMemoryPlanningStore | ✅ Named file | ✅ "same as storage.ts" | ✅ CRUD ops listed | **Strongest issue** |
| 3 | Document data model | ⚠️ Named file | ❌ None | ❌ Vague | **Weakest — no template** |
| 4 | Create goal definition tools | ✅ Named tools | ⚠️ Implicit | ✅ Integration tests | Good but missing param schemas |
| 5 | Create goal API endpoints | ✅ Exact routes | ⚠️ Implicit | ✅ Auth + fields | Concise, effective |
| 6 | Frontend goal summary display | ⚠️ "in chat" | ❌ None | ⚠️ Partial | Missing DOM insertion point |
| 7–9 | Research workflow | Same pattern as 4–6 | Same gaps | Same quality | Consistent but same weaknesses |
| 10–12 | Milestone planning | Same pattern as 4–6 | Same gaps | Same quality | No evolution from Stage 1 |

### Key Insight: Pattern Reference = Quality

Issue 2 (InMemoryPlanningStore) was the strongest because it said **"follow the pattern in storage.ts."** This single instruction eliminated style/architecture debates during review. The resulting `planning-store.ts` faithfully mirrors `storage.ts` in structure.

Frontend issues (6, 9, 12) were weakest because they lacked:
- DOM insertion point
- Existing rendering patterns in `app.js`
- CSS class conventions

---

## Integration with Existing Codebase

### Current IssueDraft Interface Strengths

The existing `IssueDraft` in [planning-types.ts](../../../planning-types.ts) already captures:
- `purpose` + `problem` + `expectedOutcome` — the What/Why/Done trio all agent platforms recommend
- `scopeBoundaries` — explicitly called the #1 timeout prevention strategy
- `acceptanceCriteria` — the most critical field per GitHub's docs
- `testingExpectations` — testing strategy description
- `dependencies` — ordering for sequential execution
- `researchLinks` — unique advantage over the template (if rendered)

### Recommended IssueDraft Interface Changes

```typescript
// NEW fields to add to IssueDraft interface
export interface IssueDraft {
  // ... existing fields ...

  /** Files that should be created or modified. */
  filesToModify: FileRef[];

  /** Files to read for context (not modified). */
  filesToRead: FileRef[];

  /** Existing file/pattern to use as implementation reference. */
  patternReference?: string;

  /** Security-specific validation rules for this issue. */
  securityChecklist: string[];

  /** Exact commands to run for self-verification. */
  verificationCommands: string[];
}

/** Reference to a file with a reason for inclusion. */
export interface FileRef {
  /** Relative file path (e.g., "server.ts", "public/app.js"). */
  path: string;
  /** Why this file is relevant (e.g., "Add new endpoint", "Follow CRUD pattern"). */
  reason: string;
}
```

### Recommended Issue Template Additions

The issue template in `stage-setup.agent.md` should add a **Research Context** section:

```markdown
## Research Context

{For each researchLink — render the question, findings, and decision from the resolved ResearchItem}
```

### Issue Quality Checklist

Before marking an `IssueDraft` as `ready`, validate:

| Check | Field | Criterion |
|-------|-------|-----------|
| ✅ Has clear problem statement | `problem` | Non-empty, < 1000 chars, reads as a prompt |
| ✅ Has acceptance criteria | `acceptanceCriteria` | ≥ 1 criterion, each testable |
| ✅ Has file references | `filesToModify` | ≥ 1 file with reason |
| ✅ Has scope boundaries | `scopeBoundaries` | Includes "Out of scope" items |
| ✅ Has test expectations | `testingExpectations` | Names specific test commands |
| ✅ Has verification commands | `verificationCommands` | ≥ 1 runnable command |
| ✅ Appropriate scope | *(heuristic)* | ≤ 5 files modified, ≤ 1 layer (backend OR frontend) |
| ⚠️ Has pattern reference | `patternReference` | Optional but strongly recommended |
| ⚠️ Has research context | `researchLinks` | Required if research was conducted |
| ⚠️ Has security checklist | `securityChecklist` | Required if accepting user input |

---

## Decision: Ready for Implementation

R9 findings are complete and actionable. The `IssueDraft` interface should be extended with 5 new fields before implementing the `generate_issue_drafts` tool (Issue 4.6):

1. `filesToModify: FileRef[]` — **critical** (most impactful missing field)
2. `filesToRead: FileRef[]` — **critical** (agent orientation)
3. `patternReference?: string` — **high-value** (strongest quality predictor)
4. `securityChecklist: string[]` — **medium** (prevents review loops)
5. `verificationCommands: string[]` — **medium** (enables agent self-check)

Plus a new `FileRef` interface and an issue quality validation checklist.

This work should be done as a prerequisite sub-task within Issue 4.6 or as a dedicated issue before 4.6.
