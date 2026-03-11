# R10 Research Retrospective

> **Research item:** MCP Server Architecture  
> **Date:** 2026-03-11  
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **Codebase-first approach paid off** — Reading `sdk-reference.md` section 8.9, `server.ts`, `tools.ts`, and existing R3 findings before dispatching sub-agents meant sub-questions were tightly scoped and relevant.
- **Sub-agent results were complementary** — SQ1 (protocol), SQ2 (SDK integration), SQ3 (building servers), SQ4 (token isolation), SQ5 (comparison), SQ6 (existing servers) each covered a distinct facet with minimal overlap.
- **R3 cross-reference was critical** — R3 had already established Option A (direct REST) as the recommendation. R10 correctly evaluated MCP against that established baseline rather than in isolation.
- **Official GitHub MCP Server discovery** — SQ6 found that `github/github-mcp-server` (28k stars, v0.32) already exposes most needed write tools including `assign_copilot_to_issue` and `request_copilot_review`. This is a key finding for future architecture decisions.

## What Could Be Improved

- **SDK type exploration limited** — SQ2 explored `node_modules/@github/copilot-sdk/dist/types.d.ts` but the SDK repo is private, so some MCP integration details (e.g., `"sse"` vs `"http"` transport distinction) remain unclear.
- **No live testing** — All findings are documentation-based. A real integration test (spawn MCP server, connect via SDK, call a tool) would provide stronger confidence.
- **MCP v1 vs v2 confusion** — SQ3 returned both v1 and v2 API patterns. The synthesis document uses only v1 patterns (the current stable release) for consistency, but the v2 migration path should be noted for future reference.

## Key Findings

1. **MCP is production-ready** — The protocol (JSON-RPC 2.0), TypeScript SDK (`@modelcontextprotocol/sdk`), and Copilot SDK integration are all mature.
2. **Custom `Tool[]` wins for this project** — Zero overhead, closure-based token isolation, direct testability, no architectural changes needed.
3. **Official GitHub MCP Server is impressive** — Covers issues, branches, PRs, labels, Copilot assignment. Missing milestone creation. Requires Docker.
4. **MCP adds process-per-session overhead** — For local transport, each SDK session spawns a separate MCP server process. Not ideal for scale-to-zero Container App.
5. **MCP permission model is more granular** — `kind: "mcp"` with `readOnly` flag is better than `kind: "custom-tool"` blanket approval. Worth adopting in custom tools via hooks.

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 6 |
| Parallel batches | 2 (first 1, then 5 parallel) |
| Files created | 2 (R10 doc + retrospective) |
| Codebase files read | 7 (server.ts, tools.ts, sdk-reference.md, planning-tools.ts, R3 doc, R1 doc, package.json) |
| External sources consulted | MCP spec site, GitHub MCP server repo, npm registry, MCP TypeScript SDK repo |

## Recommendations for Next Research

- **R5 (Persistent Storage)** should be next — the custom tools path is confirmed; now the data layer needs to be designed.
- If MCP is revisited later, start by **testing the official GitHub MCP Server** with a real SDK session before building anything custom.
- The `readOnly` permission flag from MCP is a good pattern — consider adding a similar concept to the custom `safePermissionHandler` for write tools.
