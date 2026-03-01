// ============================================================================
// repo-tools.ts — File exploration tools for the analyst agent
// All operations are read-only against the checked-out repo.
// ============================================================================

import { readFile, readdir, stat, access } from "node:fs/promises";
import { join, relative } from "node:path";

// ---------------------------------------------------------------------------
// 1. TOOL DEFINITIONS (Anthropic tool schema format)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    name: "search_in_file",
    description: `Search for a pattern (case-insensitive substring or regex) in a file. Returns matching lines with line numbers and 1 line of context above/below.

IMPORTANT: If the pattern matches too many lines (>30), you will only receive the count and first 5 matches. You should then refine your search with a more specific pattern, or use get_lines to read a specific region you're interested in.

Use this to find function definitions, usages, imports, specific identifiers, etc.`,
    input_schema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description:
            "Path to the file, relative to the repo root (e.g. 'src/services/UserService.ts')",
        },
        pattern: {
          type: "string",
          description:
            "Search pattern — treated as a case-insensitive substring. For regex, prefix with 're:' (e.g. 're:function\\s+create')",
        },
      },
      required: ["filepath", "pattern"],
    },
  },
  {
    name: "get_lines",
    description: `Read a specific range of lines from a file. Returns the lines with line numbers.

Maximum of 100 lines per call. If you need more, make multiple calls with consecutive ranges.

Use this after search_in_file to read surrounding context, or to read a known function/class definition.`,
    input_schema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description: "Path to the file, relative to the repo root",
        },
        start_line: {
          type: "number",
          description: "First line to read (1-based, inclusive)",
        },
        end_line: {
          type: "number",
          description: "Last line to read (1-based, inclusive). Max 100 lines from start_line.",
        },
      },
      required: ["filepath", "start_line", "end_line"],
    },
  },
  {
    name: "get_file_info",
    description:
      "Get metadata about a file: whether it exists, its line count, and byte size. Use this before reading a file to understand its size, or to check if a file exists.",
    input_schema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description: "Path to the file, relative to the repo root",
        },
      },
      required: ["filepath"],
    },
  },
  {
    name: "list_files",
    description: `List files in a directory. Always returns:
- total_files: total number of files in the directory (recursive)
- matched_files: number of files matching the pattern (if given)
- files: the matched file paths (or all, if no pattern)

If there are more than 100 matched files, only the first 100 are listed.

Use this to understand project structure, find test files, locate configs, etc.`,
    input_schema: {
      type: "object" as const,
      properties: {
        directory: {
          type: "string",
          description:
            "Directory path relative to repo root (e.g. 'src/services'). Use '.' for repo root.",
        },
        pattern: {
          type: "string",
          description:
            "Optional glob-like filter. Supports: '*.ts' (extension), '*test*' (substring), 'prefix*' (starts with). Case-insensitive.",
        },
      },
      required: ["directory"],
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

// ---------------------------------------------------------------------------
// 2. TOOL RESULT TYPES
// ---------------------------------------------------------------------------

interface SearchMatch {
  line_number: number;
  content: string;
  context_before?: string;
  context_after?: string;
}

interface SearchResult {
  filepath: string;
  pattern: string;
  total_matches: number;
  matches: SearchMatch[];
  truncated: boolean;
  message?: string;
}

interface GetLinesResult {
  filepath: string;
  start_line: number;
  end_line: number;
  total_lines_in_file: number;
  lines: { line_number: number; content: string }[];
}

interface FileInfoResult {
  filepath: string;
  exists: boolean;
  line_count?: number;
  byte_size?: number;
}

interface ListFilesResult {
  directory: string;
  pattern?: string;
  total_files: number;
  matched_files: number;
  files: string[];
  truncated: boolean;
}

type ToolResult =
  | SearchResult
  | GetLinesResult
  | FileInfoResult
  | ListFilesResult
  | { error: string };

// ---------------------------------------------------------------------------
// 3. HELPERS
// ---------------------------------------------------------------------------

/** Resolve a relative path safely within the repo root */
function safePath(repoRoot: string, filepath: string): string {
  const resolved = join(repoRoot, filepath);
  const rel = relative(repoRoot, resolved);
  // Prevent path traversal
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path traversal not allowed: "${filepath}"`);
  }
  return resolved;
}

/** Read a file and split into lines, with caching for repeated reads */
const fileCache = new Map<string, string[]>();

async function readLines(absPath: string): Promise<string[]> {
  if (fileCache.has(absPath)) return fileCache.get(absPath)!;
  const content = await readFile(absPath, "utf-8");
  const lines = content.split("\n");
  fileCache.set(absPath, lines);
  return lines;
}

/** Simple glob-like matcher for list_files pattern */
function matchesPattern(filename: string, pattern: string): boolean {
  const lower = filename.toLowerCase();
  const p = pattern.toLowerCase();

  if (p.startsWith("*") && p.endsWith("*")) {
    // *substring*
    return lower.includes(p.slice(1, -1));
  } else if (p.startsWith("*.")) {
    // *.ext
    return lower.endsWith(p.slice(1));
  } else if (p.endsWith("*")) {
    // prefix*
    return lower.startsWith(p.slice(0, -1));
  } else if (p.startsWith("*")) {
    // *suffix
    return lower.endsWith(p.slice(1));
  } else {
    // Exact (case-insensitive) or substring fallback
    return lower.includes(p);
  }
}

/** Recursively list all files in a directory */
async function walkDir(
  dir: string,
  repoRoot: string,
  depth = 0
): Promise<string[]> {
  // Guard against circular symlinks and absurdly deep trees
  if (depth > 20) return [];

  const results: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip symlinks entirely to avoid circular references
    if (entry.isSymbolicLink()) continue;

    const fullPath = join(dir, entry.name);
    // Skip common non-useful directories
    if (
      entry.isDirectory() &&
      ["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "vendor"].includes(
        entry.name
      )
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath, repoRoot, depth + 1)));
    } else if (entry.isFile()) {
      results.push(relative(repoRoot, fullPath));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. TOOL IMPLEMENTATIONS
// ---------------------------------------------------------------------------

const MAX_SEARCH_RESULTS_FULL = 30;
const MAX_SEARCH_RESULTS_PREVIEW = 5;
const MAX_GET_LINES = 100;
const MAX_LIST_FILES = 100;

async function searchInFile(
  repoRoot: string,
  filepath: string,
  pattern: string
): Promise<SearchResult> {
  if (!pattern.trim()) {
    return {
      filepath,
      pattern,
      total_matches: 0,
      matches: [],
      truncated: false,
      message: "Empty pattern. Provide a specific search term (function name, variable, keyword).",
    };
  }

  const absPath = safePath(repoRoot, filepath);
  const lines = await readLines(absPath);

  // Build regex from pattern
  let regex: RegExp;
  if (pattern.startsWith("re:")) {
    try {
      regex = new RegExp(pattern.slice(3), "i");
    } catch {
      return {
        filepath,
        pattern,
        total_matches: 0,
        matches: [],
        truncated: false,
        message: `Invalid regex: "${pattern.slice(3)}"`,
      };
    }
  } else {
    // Escape special regex chars for substring match
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escaped, "i");
  }

  // Find all matching line indices
  const matchingIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matchingIndices.push(i);
    }
  }

  const totalMatches = matchingIndices.length;

  // If too many matches, return only a preview + guidance
  if (totalMatches > MAX_SEARCH_RESULTS_FULL) {
    const previewIndices = matchingIndices.slice(0, MAX_SEARCH_RESULTS_PREVIEW);
    const matches: SearchMatch[] = previewIndices.map((i) => ({
      line_number: i + 1,
      content: lines[i],
      context_before: i > 0 ? lines[i - 1] : undefined,
      context_after: i < lines.length - 1 ? lines[i + 1] : undefined,
    }));

    return {
      filepath,
      pattern,
      total_matches: totalMatches,
      matches,
      truncated: true,
      message:
        `Pattern "${pattern}" matched ${totalMatches} lines — too many to return. ` +
        `Showing first ${MAX_SEARCH_RESULTS_PREVIEW} matches. ` +
        `Refine your search with a more specific pattern, or use get_lines to read a specific region.`,
    };
  }

  // Normal case: return all matches with context
  const matches: SearchMatch[] = matchingIndices.map((i) => ({
    line_number: i + 1,
    content: lines[i],
    context_before: i > 0 ? lines[i - 1] : undefined,
    context_after: i < lines.length - 1 ? lines[i + 1] : undefined,
  }));

  return {
    filepath,
    pattern,
    total_matches: totalMatches,
    matches,
    truncated: false,
  };
}

async function getLines(
  repoRoot: string,
  filepath: string,
  startLine: number,
  endLine: number
): Promise<GetLinesResult> {
  const absPath = safePath(repoRoot, filepath);
  const allLines = await readLines(absPath);
  const totalLines = allLines.length;

  // Clamp to valid range
  let start = Math.max(1, Math.floor(startLine));
  let end = Math.min(totalLines, Math.floor(endLine));

  // Swap if reversed
  if (start > end) {
    [start, end] = [end, start];
  }

  // Enforce max 100 lines
  if (end - start + 1 > MAX_GET_LINES) {
    end = start + MAX_GET_LINES - 1;
  }

  const lines = [];
  for (let i = start; i <= end; i++) {
    lines.push({ line_number: i, content: allLines[i - 1] });
  }

  return {
    filepath,
    start_line: start,
    end_line: end,
    total_lines_in_file: totalLines,
    lines,
  };
}

async function getFileInfo(
  repoRoot: string,
  filepath: string
): Promise<FileInfoResult> {
  const absPath = safePath(repoRoot, filepath);

  try {
    await access(absPath);
  } catch {
    return { filepath, exists: false };
  }

  const st = await stat(absPath);
  if (!st.isFile()) {
    return { filepath, exists: false };
  }

  const lines = await readLines(absPath);

  return {
    filepath,
    exists: true,
    line_count: lines.length,
    byte_size: st.size,
  };
}

async function listFiles(
  repoRoot: string,
  directory: string,
  pattern?: string
): Promise<ListFilesResult> {
  const absDir = safePath(repoRoot, directory);
  const allFiles = await walkDir(absDir, repoRoot);
  const totalFiles = allFiles.length;

  let matched: string[];
  if (pattern) {
    matched = allFiles.filter((f) => {
      const basename = f.split("/").pop() || f;
      return matchesPattern(basename, pattern);
    });
  } else {
    matched = allFiles;
  }

  const matchedCount = matched.length;
  const truncated = matchedCount > MAX_LIST_FILES;

  return {
    directory,
    pattern,
    total_files: totalFiles,
    matched_files: matchedCount,
    files: matched.slice(0, MAX_LIST_FILES),
    truncated,
  };
}

// ---------------------------------------------------------------------------
// 5. TOOL EXECUTOR (called by the ReACT loop)
// ---------------------------------------------------------------------------

/**
 * Execute a tool call and return the JSON result string.
 * This is the single entry point the ReACT runner uses.
 */
export async function executeTool(
  repoRoot: string,
  toolName: string,
  input: Record<string, any>
): Promise<string> {
  try {
    let result: ToolResult;

    switch (toolName) {
      case "search_in_file":
        result = await searchInFile(repoRoot, input.filepath, input.pattern);
        break;
      case "get_lines":
        result = await getLines(
          repoRoot,
          input.filepath,
          input.start_line,
          input.end_line
        );
        break;
      case "get_file_info":
        result = await getFileInfo(repoRoot, input.filepath);
        break;
      case "list_files":
        result = await listFiles(repoRoot, input.directory, input.pattern);
        break;
      default:
        result = { error: `Unknown tool: ${toolName}` };
    }

    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: `Tool "${toolName}" failed: ${(err as Error).message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 6. CONVENTION FILE READER
// ---------------------------------------------------------------------------

/**
 * Convention files to look for in the repo, in priority order.
 * Add new filenames here as needed — they'll be auto-discovered.
 */
export const CONVENTION_FILENAMES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".github/AGENTS.md",
  ".github/CLAUDE.md",
  ".github/REVIEW_GUIDE.md",
  "CONTRIBUTING.md",
  ".cursorrules",
  "CONVENTIONS.md",
  "CODING_STANDARDS.md",
  ".github/CONTRIBUTING.md",
];

export interface ConventionFile {
  name: string;
  content: string;
}

export interface ConventionFilesResult {
  files: ConventionFile[];
  /** Pre-formatted string ready to inject into prompts. Empty string if none found. */
  formatted: string;
}

/**
 * Read any convention/agent instruction files that exist in the repo.
 * Returns structured results with both raw files and a formatted prompt string.
 */
export async function readConventionFiles(
  repoRoot: string
): Promise<ConventionFilesResult> {
  const found: ConventionFile[] = [];

  for (const name of CONVENTION_FILENAMES) {
    try {
      const absPath = safePath(repoRoot, name);
      const content = await readFile(absPath, "utf-8");
      if (content.trim()) {
        found.push({ name, content: content.trim() });
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  const formatted =
    found.length > 0
      ? found.map((f) => `=== ${f.name} ===\n${f.content}`).join("\n\n")
      : "";

  return { files: found, formatted };
}

/** Clear the file cache (call between runs if needed) */
export function clearFileCache() {
  fileCache.clear();
}
