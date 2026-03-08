import type { Tool } from "@github/copilot-sdk";

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

// --- Tool factory (creates tools bound to a user's GitHub token) ---

// Exported tool names for permission handler reference
export const GITHUB_TOOL_NAMES = [
  "list_repos",
  "get_repo_structure",
  "read_repo_file",
  "list_issues",
  "search_code",
] as const;

// Max file size returned by read_repo_file (100KB) to prevent blowing up LLM context
const MAX_FILE_SIZE = 100 * 1024;

export function createGitHubTools(token: string): Tool[] {
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

  return [listRepos, getRepoStructure, readRepoFile, listIssues, searchCode];
}
