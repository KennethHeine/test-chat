import type { Tool } from "@github/copilot-sdk";
import type { PlanningStore } from "./planning-store.js";
import type { IssueDraft, ResearchItem } from "./planning-types.js";

// --- GitHub API helper ---

async function githubFetch(token: string, path: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "copilot-agent-orchestrator",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Sends a write request (POST, PATCH, PUT, DELETE) to the GitHub REST API.
 * Handles authentication, content-type, and rate-limit monitoring.
 * Throws on non-2xx responses. Returns null for 204 No Content.
 */
async function githubWrite(
  token: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "copilot-agent-orchestrator",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${errorBody.slice(0, 200)}`);
  }
  // Monitor rate limits; pause 1s when remaining is critically low (applies to all responses incl. 204)
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (remaining !== null && parseInt(remaining, 10) < 10) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }
  // 204 No Content (e.g., DELETE) — return null
  if (res.status === 204) return null;
  return res.json();
}

// --- ISO 8601 date validation helper ---

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function isValidIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value) && !isNaN(Date.parse(value));
}

// --- Tool factory (creates tools bound to a user's GitHub token) ---

// Exported tool names for permission handler reference
export const GITHUB_TOOL_NAMES = [
  "list_repos",
  "get_repo_structure",
  "read_repo_file",
  "list_issues",
  "search_code",
  "create_github_milestone",
  "create_github_issue",
  "create_github_branch",
  "manage_github_labels",
] as const;

// Valid hex color pattern (6 hex digits, no # prefix)
const HEX_COLOR_RE = /^[0-9a-fA-F]{6}$/;

// Branch name sanitization: keep only alphanumerics, dots, hyphens, underscores, and slashes
const BRANCH_UNSAFE_RE = /[^a-zA-Z0-9._/-]/g;

// Default label color used when none is provided (GitHub blue)
const DEFAULT_LABEL_COLOR = "0075ca";

// Max file size returned by read_repo_file (100KB) to prevent blowing up LLM context
const MAX_FILE_SIZE = 100 * 1024;

/**
 * Builds a formatted Markdown body for a GitHub issue from an IssueDraft
 * and its associated ResearchItems (for the Research Context section).
 * Renders the relevant implementation fields: purpose, problem, expected outcome,
 * scope boundaries, technical context, acceptance criteria, testing expectations,
 * files to modify/read, pattern reference, security checklist, verification commands,
 * and a research context section. Internal planning fields (order, status, dependencies)
 * are intentionally omitted as they are not useful in the rendered issue body.
 */
function buildIssueBody(draft: IssueDraft, researchItems: ResearchItem[]): string {
  const lines: string[] = [];

  /**
   * Escapes pipe characters and strips newlines in a Markdown table cell value
   * to prevent the rendered table from breaking in the GitHub issue body.
   * @param value - The raw cell string to escape.
   * @returns The sanitized string safe for use inside a Markdown table cell.
   */
  function escapeTableCell(value: string): string {
    return value.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  }

  lines.push("## Purpose", "", draft.purpose, "");
  lines.push("## Problem", "", draft.problem, "");
  lines.push("## Expected Outcome", "", draft.expectedOutcome, "");
  lines.push("## Scope Boundaries", "", draft.scopeBoundaries, "");
  lines.push("## Technical Context", "", draft.technicalContext, "");

  lines.push("## Acceptance Criteria", "");
  for (const criterion of draft.acceptanceCriteria) {
    lines.push(`- [ ] ${criterion}`);
  }
  lines.push("");

  lines.push("## Testing Expectations", "", draft.testingExpectations, "");

  if (draft.filesToModify.length > 0) {
    lines.push("## Files to Modify", "");
    lines.push("| File | Reason |");
    lines.push("|------|--------|");
    for (const f of draft.filesToModify) {
      lines.push(`| \`${escapeTableCell(f.path)}\` | ${escapeTableCell(f.reason)} |`);
    }
    lines.push("");
  }

  if (draft.filesToRead.length > 0) {
    lines.push("## Files to Read", "");
    lines.push("| File | Reason |");
    lines.push("|------|--------|");
    for (const f of draft.filesToRead) {
      lines.push(`| \`${escapeTableCell(f.path)}\` | ${escapeTableCell(f.reason)} |`);
    }
    lines.push("");
  }

  if (draft.patternReference) {
    lines.push("## Pattern Reference", "", draft.patternReference, "");
  }

  if (draft.securityChecklist.length > 0) {
    lines.push("## Security Checklist", "");
    for (const item of draft.securityChecklist) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  if (draft.verificationCommands.length > 0) {
    lines.push("## Verification Commands", "");
    for (const cmd of draft.verificationCommands) {
      lines.push(`    ${cmd}`);
    }
    lines.push("");
  }

  if (researchItems.length > 0) {
    lines.push("## Research Context", "");
    for (const item of researchItems) {
      lines.push(`### ${item.question}`, "");
      if (item.findings) {
        lines.push(`**Findings:** ${item.findings}`, "");
      }
      if (item.decision) {
        lines.push(`**Decision:** ${item.decision}`, "");
      }
    }
  }

  return lines.join("\n");
}

export function createGitHubTools(token: string, planningStore?: PlanningStore): Tool[] {
  const listRepos: Tool = {
    name: "list_repos",
    description:
      "List GitHub repositories for a user or organization. Returns name, description, language, and URL for each repository.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "GitHub username or organization name. If omitted, lists repos for the authenticated user.",
        },
        type: {
          type: "string",
          enum: ["all", "owner", "member"],
          description: "Filter by repo type: all, owner, or member. The GitHub API default varies by endpoint.",
        },
        sort: {
          type: "string",
          enum: ["created", "updated", "pushed", "full_name"],
          description: "Sort field (default: updated)",
        },
        per_page: {
          type: "number",
          description: "Results per page (max 100, default 30)",
        },
      },
    },
    handler: async (args: any) => {
      const owner = args.owner;
      const params = new URLSearchParams();
      if (args.type) params.set("type", args.type);
      if (args.sort) params.set("sort", args.sort);
      if (args.per_page) params.set("per_page", String(args.per_page));

      const path = owner
        ? `/users/${encodeURIComponent(owner)}/repos?${params}`
        : `/user/repos?${params}`;
      const repos = (await githubFetch(token, path)) as any[];
      return repos.map((r: any) => ({
        name: r.full_name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        url: r.html_url,
        updated_at: r.updated_at,
        default_branch: r.default_branch,
      }));
    },
  };

  const getRepoStructure: Tool = {
    name: "get_repo_structure",
    description:
      "Get the file/directory tree of a GitHub repository. Returns the top-level contents by default, or contents of a specific path.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner (user or org)" },
        repo: { type: "string", description: "Repository name" },
        path: {
          type: "string",
          description: "Path within the repository (default: root '')",
        },
        ref: {
          type: "string",
          description: "Branch, tag, or commit SHA (default: default branch)",
        },
      },
      required: ["owner", "repo"],
    },
    handler: async (args: any) => {
      const { owner, repo, ref } = args;
      const repoPath = args.path || "";
      const params = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${repoPath}${params}`;
      const contents = (await githubFetch(token, path)) as any;
      if (Array.isArray(contents)) {
        return contents.map((item: any) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
        }));
      }
      // Single file
      return { name: contents.name, path: contents.path, type: contents.type, size: contents.size };
    },
  };

  const readRepoFile: Tool = {
    name: "read_repo_file",
    description:
      "Read the contents of a specific file from a GitHub repository. Returns the decoded text content (truncated to 100KB for large files).",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        path: { type: "string", description: "File path within the repository" },
        ref: { type: "string", description: "Branch, tag, or commit SHA (default: default branch)" },
      },
      required: ["owner", "repo", "path"],
    },
    handler: async (args: any) => {
      const { owner, repo, path: filePath, ref } = args;
      const params = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const apiPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}${params}`;
      const file = (await githubFetch(token, apiPath)) as any;
      if (file.type !== "file") {
        throw new Error(`Path is a ${file.type}, not a file`);
      }
      const content = Buffer.from(file.content, "base64").toString("utf-8");
      const byteLength = Buffer.byteLength(content, "utf-8");
      const truncated = byteLength > MAX_FILE_SIZE;
      const outputContent = truncated ? content.slice(0, MAX_FILE_SIZE) : content;
      return {
        path: file.path,
        size: file.size,
        truncated,
        content: outputContent,
        ...(truncated ? { note: `File truncated to ~${MAX_FILE_SIZE} bytes (original: ${byteLength} bytes)` } : {}),
      };
    },
  };

  const listIssues: Tool = {
    name: "list_issues",
    description:
      "List issues in a GitHub repository. Returns title, number, state, labels, and assignees.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner" },
        repo: { type: "string", description: "Repository name" },
        state: {
          type: "string",
          enum: ["open", "closed", "all"],
          description: "Issue state filter (default: open)",
        },
        labels: {
          type: "string",
          description: "Comma-separated list of label names to filter by",
        },
        per_page: { type: "number", description: "Results per page (max 100, default 30)" },
      },
      required: ["owner", "repo"],
    },
    handler: async (args: any) => {
      const { owner, repo, state, labels, per_page } = args;
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      if (labels) params.set("labels", labels);
      if (per_page) params.set("per_page", String(per_page));
      const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params}`;
      const issues = (await githubFetch(token, path)) as any[];
      return issues.map((i: any) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        labels: i.labels?.map((l: any) => l.name),
        assignees: i.assignees?.map((a: any) => a.login),
        created_at: i.created_at,
        updated_at: i.updated_at,
        url: i.html_url,
      }));
    },
  };

  const searchCode: Tool = {
    name: "search_code",
    description:
      "Search for code across GitHub repositories. Use qualifiers like 'repo:', 'language:', 'path:' in the query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query. Supports GitHub code search syntax (e.g., 'useState repo:facebook/react language:typescript')",
        },
        per_page: { type: "number", description: "Results per page (max 100, default 30)" },
      },
      required: ["query"],
    },
    handler: async (args: any) => {
      const { query, per_page } = args;
      const params = new URLSearchParams({ q: query });
      if (per_page) params.set("per_page", String(per_page));
      const result = (await githubFetch(token, `/search/code?${params}`)) as any;
      return {
        total_count: result.total_count,
        // Cap at 20 results to keep tool output concise for the LLM context window
        items: result.items?.slice(0, 20).map((item: any) => ({
          name: item.name,
          path: item.path,
          repository: item.repository?.full_name,
          url: item.html_url,
        })),
      };
    },
  };

  /**
   * create_github_milestone: Creates a GitHub Milestone from a planning Milestone entity.
   * Idempotent: if a milestone with the same title already exists in the repository,
   * it reuses that one. Stores the GitHub milestone number and html_url back on the
   * planning Milestone entity.
   *
   * Requires a planningStore to be provided to createGitHubTools.
   */
  const createGithubMilestone: Tool = {
    name: "create_github_milestone",
    description:
      "Create a GitHub Milestone from a planning milestone entity. " +
      "Reads the milestone title and description from the planning store, " +
      "creates (or finds) the GitHub milestone, and stores the GitHub milestone " +
      "number and URL back on the planning entity. Idempotent: existing milestones " +
      "with the same title are reused without error.",
    parameters: {
      type: "object",
      properties: {
        milestoneId: {
          type: "string",
          description: "The ID of the planning Milestone to push to GitHub.",
        },
        goalId: {
          type: "string",
          description: "The goal ID this milestone belongs to (used for ownership check).",
        },
        sessionId: {
          type: "string",
          description: "The session identifier of the caller. Must match the goal's sessionId.",
        },
        owner: {
          type: "string",
          description: "GitHub repository owner (user or organization).",
        },
        repo: {
          type: "string",
          description: "GitHub repository name.",
        },
        dueDate: {
          type: "string",
          description:
            "Optional due date for the milestone in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ " +
            "(e.g., '2026-06-01T00:00:00Z'). Must be a valid date.",
        },
      },
      required: ["milestoneId", "goalId", "sessionId", "owner", "repo"],
    },
    handler: async (args: any) => {
      if (!planningStore) {
        throw new Error("Planning store not available");
      }

      // Validate required string fields
      if (typeof args.milestoneId !== "string" || args.milestoneId.trim().length === 0) {
        throw new Error("milestoneId must be a non-empty string");
      }
      if (typeof args.goalId !== "string" || args.goalId.trim().length === 0) {
        throw new Error("goalId must be a non-empty string");
      }
      if (typeof args.sessionId !== "string" || args.sessionId.trim().length === 0) {
        throw new Error("sessionId must be a non-empty string");
      }
      if (typeof args.owner !== "string" || args.owner.trim().length === 0) {
        throw new Error("owner must be a non-empty string");
      }
      if (typeof args.repo !== "string" || args.repo.trim().length === 0) {
        throw new Error("repo must be a non-empty string");
      }

      // Validate optional dueDate (must be valid ISO 8601: YYYY-MM-DDTHH:MM:SSZ)
      if (args.dueDate !== undefined && args.dueDate !== null && args.dueDate !== "") {
        if (typeof args.dueDate !== "string" || !isValidIsoDate(args.dueDate)) {
          throw new Error("dueDate must be a valid ISO 8601 date string (YYYY-MM-DDTHH:MM:SSZ)");
        }
      }

      // Ownership check: verify goal belongs to caller's session
      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        throw new Error(`Goal not found: ${args.goalId}`);
      }

      // Verify milestone belongs to the stated goal
      const milestone = await planningStore.getMilestone(args.milestoneId);
      if (!milestone || milestone.goalId !== args.goalId) {
        throw new Error(`Milestone not found: ${args.milestoneId}`);
      }

      const { owner, repo } = args;
      const title = milestone.name;
      const description = milestone.goal;

      // Idempotency: paginate all open GitHub milestones to find a title match
      let githubNumber: number | undefined;
      let githubUrl: string | undefined;
      let page = 1;
      while (githubNumber === undefined) {
        const existing = (await githubFetch(
          token,
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones?state=open&per_page=100&page=${page}`
        )) as any[];

        const match = existing.find((m: any) => m.title === title);
        if (match) {
          githubNumber = match.number;
          githubUrl = match.html_url;
          break;
        }
        if (existing.length < 100) {
          // No more pages
          break;
        }
        page += 1;
      }

      // Create the milestone if it doesn't already exist
      if (githubNumber === undefined) {
        const body: Record<string, unknown> = {
          title,
          description,
        };
        if (args.dueDate) {
          body.due_on = args.dueDate;
        }
        const created = (await githubWrite(
          token,
          "POST",
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones`,
          body
        )) as any;
        githubNumber = created.number;
        githubUrl = created.html_url;
      }

      // Store GitHub milestone data back on the planning entity
      const updated = await planningStore.updateMilestone(args.milestoneId, {
        githubNumber,
        githubUrl,
      });
      if (!updated) {
        throw new Error(`Milestone not found after update: ${args.milestoneId}`);
      }
      return {
        milestoneId: args.milestoneId,
        githubNumber,
        githubUrl,
      };
    },
  };

  /**
   * create_github_issue: Creates a real GitHub issue from an IssueDraft.
   * Formats the issue body as Markdown containing all IssueDraft fields including
   * R9 quality fields and a Research Context section built from researchLinks.
   * Idempotent: if the draft is already 'created', returns existing data.
   * Updates the IssueDraft status to 'created' and stores the GitHub issue number.
   *
   * Requires a planningStore to be provided to createGitHubTools.
   */
  const createGithubIssue: Tool = {
    name: "create_github_issue",
    description:
      "Create a real GitHub issue from an IssueDraft. " +
      "Formats the issue body as Markdown with all relevant fields (purpose, problem, " +
      "expected outcome, scope, technical context, acceptance criteria, testing expectations, " +
      "files, security checklist, verification commands) and a Research Context section " +
      "built from researchLinks. Associates the issue with a GitHub Milestone if one " +
      "has been created. Idempotent: if the draft is already created, returns existing data. " +
      "Updates the IssueDraft status to 'created' and stores the GitHub issue number.",
    parameters: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          description: "The ID of the IssueDraft to push to GitHub.",
        },
        goalId: {
          type: "string",
          description: "The goal ID that owns the milestone this draft belongs to (used for ownership check).",
        },
        sessionId: {
          type: "string",
          description: "The session identifier of the caller. Must match the goal's sessionId.",
        },
        owner: {
          type: "string",
          description: "GitHub repository owner (user or organization).",
        },
        repo: {
          type: "string",
          description: "GitHub repository name.",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of label names to apply to the created issue.",
        },
      },
      required: ["draftId", "goalId", "sessionId", "owner", "repo"],
    },
    handler: async (args: any) => {
      if (!planningStore) {
        throw new Error("Planning store not available");
      }

      // Validate required string fields
      if (typeof args.draftId !== "string" || args.draftId.trim().length === 0) {
        throw new Error("draftId must be a non-empty string");
      }
      if (typeof args.goalId !== "string" || args.goalId.trim().length === 0) {
        throw new Error("goalId must be a non-empty string");
      }
      if (typeof args.sessionId !== "string" || args.sessionId.trim().length === 0) {
        throw new Error("sessionId must be a non-empty string");
      }
      if (typeof args.owner !== "string" || args.owner.trim().length === 0) {
        throw new Error("owner must be a non-empty string");
      }
      if (typeof args.repo !== "string" || args.repo.trim().length === 0) {
        throw new Error("repo must be a non-empty string");
      }

      // Ownership check: verify goal belongs to caller's session
      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        throw new Error(`Goal not found: ${args.goalId}`);
      }

      // Look up the draft and verify it belongs to a milestone under this goal
      const draft = await planningStore.getIssueDraft(args.draftId);
      if (!draft) {
        throw new Error(`Issue draft not found: ${args.draftId}`);
      }
      const milestone = await planningStore.getMilestone(draft.milestoneId);
      if (!milestone || milestone.goalId !== args.goalId) {
        throw new Error(`Issue draft not found: ${args.draftId}`);
      }

      // Idempotency: if already created with a valid issue number, return existing data
      if (draft.status === "created") {
        if (draft.githubIssueNumber === undefined) {
          throw new Error(`Issue draft ${args.draftId} has status 'created' but is missing githubIssueNumber — data integrity error`);
        }
        return {
          draftId: args.draftId,
          githubIssueNumber: draft.githubIssueNumber,
          alreadyCreated: true,
        };
      }

      // Reject drafts that are not ready to push to GitHub
      if (draft.status !== "ready") {
        throw new Error(`Issue draft ${args.draftId} has status '${draft.status}' — only drafts with status 'ready' can be pushed to GitHub`);
      }

      const { owner, repo } = args;

      // Fetch ResearchItems for the Research Context section
      const researchItems: ResearchItem[] = [];
      for (const researchId of draft.researchLinks) {
        const item = await planningStore.getResearchItem(researchId);
        if (item) researchItems.push(item);
      }

      // Build the Markdown body
      const body = buildIssueBody(draft, researchItems);

      // Build the request body for the GitHub Issues API
      const requestBody: Record<string, unknown> = {
        title: draft.title,
        body,
      };

      // Associate with GitHub Milestone if one has been created
      if (milestone.githubNumber !== undefined) {
        requestBody.milestone = milestone.githubNumber;
      }

      // Apply labels if provided — validate, trim, and deduplicate
      if (Array.isArray(args.labels) && args.labels.length > 0) {
        const labels = Array.from(
          new Set(
            args.labels
              .filter((label: unknown): label is string => typeof label === "string")
              .map((label: string) => label.trim())
              .filter((label: string) => label.length > 0)
          )
        );
        if (labels.length > 0) {
          requestBody.labels = labels;
        }
      }

      // Create the GitHub issue
      const created = (await githubWrite(
        token,
        "POST",
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
        requestBody
      )) as any;

      // Verify response: treat missing/invalid issue number as hard failure
      if (!created.number || !Number.isFinite(created.number)) {
        throw new Error("GitHub API response is missing a valid issue number — issue creation may have failed silently");
      }

      // Verify other response fields (silent failure detection — emit warnings, not errors)
      const warnings: string[] = [];
      if (created.state !== "open") {
        warnings.push(`Expected issue state 'open', got '${created.state}'`);
      }
      if (created.title !== draft.title) {
        warnings.push(`Issue title mismatch: expected '${draft.title}', got '${created.title}'`);
      }
      if (milestone.githubNumber !== undefined && created.milestone?.number !== milestone.githubNumber) {
        warnings.push(`Milestone association may have been dropped (expected ${milestone.githubNumber}, got ${created.milestone?.number})`);
      }

      // Update IssueDraft status to 'created' and store the GitHub issue number
      const updatedDraft = await planningStore.updateIssueDraft(args.draftId, {
        status: "created",
        githubIssueNumber: created.number,
      });
      if (!updatedDraft) {
        throw new Error(`Issue draft not found after update: ${args.draftId}`);
      }

      const result: Record<string, unknown> = {
        draftId: args.draftId,
        githubIssueNumber: created.number,
        githubIssueUrl: created.html_url,
      };
      if (warnings.length > 0) {
        result.warnings = warnings;
      }
      return result;
    },
  };

  /**
   * create_github_branch: Creates a new Git branch in a GitHub repository from a specified base SHA.
   * The branch name is sanitized to remove characters that are unsafe in Git ref names.
   * Idempotent: if the branch already exists (422 already_exists), returns success without error.
   */
  const createGithubBranch: Tool = {
    name: "create_github_branch",
    description:
      "Create a new Git branch in a GitHub repository from a specified base commit SHA. " +
      "Branch names are sanitized (only alphanumerics, dots, hyphens, underscores, and slashes allowed). " +
      "Idempotent: if the branch already exists, returns success without error.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "GitHub repository owner (user or organization).",
        },
        repo: {
          type: "string",
          description: "GitHub repository name.",
        },
        branchName: {
          type: "string",
          description:
            "Name for the new branch (e.g., 'stage-4/my-feature'). " +
            "Will be sanitized: characters outside [a-zA-Z0-9._/-] are replaced with hyphens.",
        },
        baseSha: {
          type: "string",
          description: "The full commit SHA to create the branch from.",
        },
      },
      required: ["owner", "repo", "branchName", "baseSha"],
    },
    handler: async (args: any) => {
      // Validate required string fields
      if (typeof args.owner !== "string" || args.owner.trim().length === 0) {
        throw new Error("owner must be a non-empty string");
      }
      if (typeof args.repo !== "string" || args.repo.trim().length === 0) {
        throw new Error("repo must be a non-empty string");
      }
      if (typeof args.branchName !== "string" || args.branchName.trim().length === 0) {
        throw new Error("branchName must be a non-empty string");
      }
      if (typeof args.baseSha !== "string" || args.baseSha.trim().length === 0) {
        throw new Error("baseSha must be a non-empty string");
      }

      // Sanitize branch name: replace unsafe characters with hyphens
      const sanitizedName = args.branchName.trim().replace(BRANCH_UNSAFE_RE, "-");
      if (sanitizedName.length === 0) {
        throw new Error("branchName is invalid after sanitization");
      }

      const owner = args.owner.trim();
      const repo = args.repo.trim();
      const baseSha = args.baseSha.trim();
      const ref = `refs/heads/${sanitizedName}`;

      try {
        const created = (await githubWrite(
          token,
          "POST",
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
          { ref, sha: baseSha }
        )) as any;
        return {
          branchName: sanitizedName,
          ref: created.ref,
          sha: created.object?.sha ?? baseSha,
          alreadyExists: false,
        };
      } catch (err: any) {
        // Handle duplicate: 422 with already_exists code
        const msg: string = err?.message ?? "";
        if (msg.includes("422")) {
          let alreadyExists = false;
          try {
            const jsonStart = msg.indexOf("{");
            if (jsonStart !== -1) {
              const parsed = JSON.parse(msg.slice(jsonStart));
              alreadyExists =
                Array.isArray(parsed.errors) &&
                parsed.errors.some((e: any) => e.code === "already_exists");
            }
          } catch {
            // JSON parse failed; re-throw the original error rather than masking it
          }
          if (alreadyExists) {
            // Fetch the actual ref so we return the current SHA, not the caller's baseSha
            try {
              const existingRef = (await githubFetch(
                token,
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(sanitizedName)}`
              )) as any;
              return {
                branchName: sanitizedName,
                ref: existingRef?.ref ?? ref,
                sha: existingRef?.object?.sha ?? null,
                alreadyExists: true,
              };
            } catch {
              // If we can't retrieve the existing ref, avoid returning a potentially inaccurate SHA
              return {
                branchName: sanitizedName,
                ref,
                sha: null,
                alreadyExists: true,
              };
            }
          }
        }
        throw err;
      }
    },
  };

  /**
   * manage_github_labels: Creates one or more GitHub labels in a repository.
   * Uses a consistent color scheme. Idempotent: 422 already_exists is treated as success.
   */
  const manageGithubLabels: Tool = {
    name: "manage_github_labels",
    description:
      "Create one or more labels in a GitHub repository with a consistent color scheme. " +
      "Idempotent: if a label already exists, it is skipped without error. " +
      "Each label requires a name; color (6-digit hex without #) and description are optional.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "GitHub repository owner (user or organization).",
        },
        repo: {
          type: "string",
          description: "GitHub repository name.",
        },
        labels: {
          type: "array",
          description: "List of labels to create.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Label name (required, non-empty).",
              },
              color: {
                type: "string",
                description:
                  "6-digit hex color without # prefix (e.g., '0075ca'). " +
                  `Defaults to '${DEFAULT_LABEL_COLOR}' if omitted.`,
              },
              description: {
                type: "string",
                description: "Optional label description (max 100 characters).",
              },
            },
            required: ["name"],
          },
        },
      },
      required: ["owner", "repo", "labels"],
    },
    handler: async (args: any) => {
      // Validate required string fields
      if (typeof args.owner !== "string" || args.owner.trim().length === 0) {
        throw new Error("owner must be a non-empty string");
      }
      if (typeof args.repo !== "string" || args.repo.trim().length === 0) {
        throw new Error("repo must be a non-empty string");
      }
      if (!Array.isArray(args.labels) || args.labels.length === 0) {
        throw new Error("labels must be a non-empty array");
      }

      const owner = args.owner.trim();
      const repo = args.repo.trim();
      const results: Array<{ name: string; color: string; alreadyExists: boolean; url?: string }> = [];

      for (const labelSpec of args.labels) {
        if (typeof labelSpec.name !== "string" || labelSpec.name.trim().length === 0) {
          throw new Error("Each label must have a non-empty name");
        }
        const name = labelSpec.name.trim();

        // Validate or default color
        let color = DEFAULT_LABEL_COLOR;
        if (labelSpec.color !== undefined && labelSpec.color !== null) {
          if (typeof labelSpec.color !== "string") {
            throw new Error(`Label '${name}': color must be a 6-digit hex string without # prefix (e.g., '0075ca')`);
          }
          const trimmedColor = labelSpec.color.trim();
          if (trimmedColor !== "") {
            if (!HEX_COLOR_RE.test(trimmedColor)) {
              throw new Error(`Label '${name}': color must be a 6-digit hex string without # prefix (e.g., '0075ca')`);
            }
            color = trimmedColor;
          }
        }

        // Validate optional description length
        const description = labelSpec.description ?? "";
        if (typeof description !== "string") {
          throw new Error(`Label '${name}': description must be a string`);
        }
        if (description.length > 100) {
          throw new Error(`Label '${name}': description exceeds 100 characters`);
        }

        const body: Record<string, unknown> = { name, color };
        if (description.length > 0) {
          body.description = description;
        }

        try {
          const created = (await githubWrite(
            token,
            "POST",
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
            body
          )) as any;
          results.push({ name, color, alreadyExists: false, url: created.url });
        } catch (err: any) {
          // Handle duplicate: 422 with already_exists code
          const msg: string = err?.message ?? "";
          if (msg.includes("422")) {
            let alreadyExists = false;
            try {
              const jsonStart = msg.indexOf("{");
              if (jsonStart !== -1) {
                const parsed = JSON.parse(msg.slice(jsonStart));
                alreadyExists =
                  Array.isArray(parsed.errors) &&
                  parsed.errors.some((e: any) => e.code === "already_exists");
              }
            } catch {
              // JSON parse failed; re-throw the original error rather than masking it
            }
            if (alreadyExists) {
              results.push({ name, color, alreadyExists: true });
              continue;
            }
          }
          throw err;
        }
      }

      return { labels: results };
    },
  };

  return [listRepos, getRepoStructure, readRepoFile, listIssues, searchCode, createGithubMilestone, createGithubIssue, createGithubBranch, manageGithubLabels];
}
