import type { Tool } from "@github/copilot-sdk";
import type { PlanningStore } from "./planning-store.js";

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
] as const;

// Max file size returned by read_repo_file (100KB) to prevent blowing up LLM context
const MAX_FILE_SIZE = 100 * 1024;

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

  return [listRepos, getRepoStructure, readRepoFile, listIssues, searchCode, createGithubMilestone];
}
