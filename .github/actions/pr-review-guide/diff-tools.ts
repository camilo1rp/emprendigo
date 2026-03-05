// ============================================================================
// diff-tools.ts — Lightweight diff overview + on-demand detail tool
//
// The full diff is parsed once. Analysts receive a compact overview and can
// pull detailed patches per-file through a tool call.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. TYPES
// ---------------------------------------------------------------------------

export interface FileDiffEntry {
  filename: string;
  status: "added" | "modified" | "deleted" | "renamed";
  old_filename?: string; // Only for renames
  additions: number;
  deletions: number;
  /** The hunk headers — gives structure without full content */
  hunks: string[];
  /** The full patch content for this file */
  patch: string;
}



// ---------------------------------------------------------------------------
// 2. PARSE FULL DIFF INTO STRUCTURED ENTRIES
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff string into per-file entries.
 * This is called once, then the entries are used to build the overview
 * and serve the get_diff_for_file tool.
 */
export function parseDiff(rawDiff: string): FileDiffEntry[] {
  const entries: FileDiffEntry[] = [];
  // Split on "diff --git" boundaries
  const fileSections = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split("\n");
    if (lines.length === 0) continue;

    // Parse header: "a/path/to/file b/path/to/file"
    // Git uses "a/" and " b/" as markers. The space before "b/" is the delimiter.
    // Handle both regular and quoted paths (spaces in filenames).
    const headerLine = lines[0];

    let oldPath: string | null = null;
    let newPath: string | null = null;

    // Try quoted format first: "a/path" "b/path"
    const quotedMatch = headerLine.match(/^"?a\/(.+?)"?\s+"?b\/(.+?)"?$/);
    if (quotedMatch) {
      oldPath = quotedMatch[1];
      newPath = quotedMatch[2];
    } else {
      // Unquoted: split on " b/" — the canonical delimiter in git diffs
      const bIdx = headerLine.indexOf(" b/");
      if (bIdx !== -1) {
        oldPath = headerLine.slice(2, bIdx); // skip "a/"
        newPath = headerLine.slice(bIdx + 3); // skip " b/"
      }
    }

    if (!oldPath || !newPath) continue;

    // Determine status
    let status: FileDiffEntry["status"] = "modified";
    const hasNewFile = lines.some((l) => l.startsWith("new file mode"));
    const hasDeleted = lines.some((l) => l.startsWith("deleted file mode"));
    const isRenamed = oldPath !== newPath;

    if (hasNewFile) status = "added";
    else if (hasDeleted) status = "deleted";
    else if (isRenamed) status = "renamed";

    // Collect hunks and count additions/deletions
    const hunks: string[] = [];
    let additions = 0;
    let deletions = 0;
    const patchLines: string[] = [];
    let inPatch = false;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        inPatch = true;
        hunks.push(line);
        patchLines.push(line);
        continue;
      }
      if (inPatch) {
        // Skip git's "no newline" marker — not actual content
        if (line.startsWith("\\ No newline")) continue;

        patchLines.push(line);
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
    }

    entries.push({
      filename: newPath,
      status,
      ...(isRenamed && { old_filename: oldPath }),
      additions,
      deletions,
      hunks,
      patch: patchLines.join("\n"),
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 3. BUILD COMPACT OVERVIEW (what analysts see upfront)
// ---------------------------------------------------------------------------

/**
 * Build a compact text overview of the diff.
 * This is small enough to include in every analyst's context.
 * Gives: file list, change stats, hunk headers (which functions changed).
 */
export function buildDiffOverview(entries: FileDiffEntry[]): string {
  const totalAdd = entries.reduce((s, e) => s + e.additions, 0);
  const totalDel = entries.reduce((s, e) => s + e.deletions, 0);

  const lines: string[] = [];

  lines.push(
    `## Diff Overview: ${entries.length} files changed (+${totalAdd} -${totalDel})`
  );
  lines.push("");

  // Group by directory for readability
  const byDir = new Map<string, FileDiffEntry[]>();
  for (const entry of entries) {
    const parts = entry.filename.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(entry);
  }

  for (const [dir, files] of byDir) {
    lines.push(`### ${dir}/`);
    for (const f of files) {
      const isBinary = f.additions === 0 && f.deletions === 0 && f.hunks.length === 0;
      const stat = isBinary ? "binary" : `+${f.additions} -${f.deletions}`;
      const statusTag =
        f.status !== "modified" ? ` [${f.status.toUpperCase()}]` : "";
      const rename =
        f.old_filename ? ` (renamed from ${f.old_filename})` : "";

      lines.push(`- **${f.filename.split("/").pop()}** (${stat})${statusTag}${rename}`);

      // Include hunk headers — they show WHICH functions/sections changed
      // without revealing the actual code
      if (f.hunks.length > 0) {
        for (const hunk of f.hunks) {
          // Extract the function/section context from hunk header
          // e.g., "@@ -10,5 +10,8 @@ function validateUser()"
          const contextMatch = hunk.match(/@@ .+? @@\s*(.*)/);
          const context = contextMatch?.[1]?.trim();
          const rangeMatch = hunk.match(
            /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
          );

          if (rangeMatch) {
            const newStart = parseInt(rangeMatch[3], 10);
            const newCount = parseInt(rangeMatch[4] || "1", 10);
            const desc = context ? ` — ${context}` : "";
            const endLine = newStart + Math.max(newCount - 1, 0);
            const range = newCount <= 1 ? `L${newStart}` : `L${newStart}-${endLine}`;
            lines.push(`    · ${range}${desc}`);
          }
        }
      }
    }
    lines.push("");
  }

  lines.push(
    `_Use get_diff_for_file(filename) to see the full patch for any file._`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 4. DIFF TOOL DEFINITION + EXECUTOR
// ---------------------------------------------------------------------------

/**
 * Tool definition for get_diff_for_file.
 * Add this to the TOOL_DEFINITIONS array used by the analyst.
 */
export const DIFF_TOOL_DEFINITION = {
  name: "get_diff_for_file",
  description: `Get the detailed diff patch for a specific file in the PR.

Returns the full unified diff for that file, showing exactly what lines were added (+), removed (-), and unchanged (context lines).

Use this when you need to see the ACTUAL CHANGES in a file — the diff overview only shows file names, stats, and hunk headers.

You can also request just a specific hunk range if you know which section you need.`,
  input_schema: {
    type: "object" as const,
    properties: {
      filename: {
        type: "string",
        description:
          "Exact filename from the diff overview (e.g., 'src/services/UserService.ts')",
      },
      hunk_index: {
        type: "number",
        description:
          "Optional: 0-based index of a specific hunk to return. " +
          "Omit to get the entire file diff. Use when the file has many hunks " +
          "and you only need one section.",
      },
    },
    required: ["filename"],
  },
} as const;

/**
 * Create a diff tool executor bound to a parsed diff.
 * Returns a function matching the executeTool signature.
 */
export function createDiffToolExecutor(
  entries: FileDiffEntry[]
): (input: Record<string, any>) => string {
  // Index by filename for O(1) lookup
  const byFilename = new Map<string, FileDiffEntry>();
  for (const entry of entries) {
    byFilename.set(entry.filename, entry);
    // Also index by old filename for renames
    if (entry.old_filename) {
      byFilename.set(entry.old_filename, entry);
    }
  }

  return (input: Record<string, any>): string => {
    try {
      const filename = input.filename as string;

      if (!filename) {
        return JSON.stringify({ error: "Missing required parameter: filename" });
      }

      const hunkIndex = input.hunk_index as number | undefined;
      const entry = byFilename.get(filename);

      if (!entry) {
        // Try fuzzy match — common mistake is missing a directory prefix
        const fuzzy = [...byFilename.entries()].find(
          ([key]) => key.endsWith(`/${filename}`) || key.endsWith(filename)
        );

        if (fuzzy) {
          return JSON.stringify({
            error: `File "${filename}" not found in diff. Did you mean "${fuzzy[0]}"?`,
            suggestion: fuzzy[0],
          });
        }

        return JSON.stringify({
          error: `File "${filename}" not found in the PR diff.`,
          available_files: [...byFilename.keys()].slice(0, 20),
        });
      }

      // Return specific hunk if requested
      if (hunkIndex !== undefined) {
        const hunkSections = splitIntoHunks(entry.patch);

        if (hunkIndex < 0 || hunkIndex >= hunkSections.length) {
          return JSON.stringify({
            error: `Hunk index ${hunkIndex} out of range. File has ${hunkSections.length} hunks (0-${hunkSections.length - 1}).`,
            total_hunks: hunkSections.length,
            hunk_headers: entry.hunks,
          });
        }

        return JSON.stringify({
          filename: entry.filename,
          status: entry.status,
          hunk_index: hunkIndex,
          total_hunks: hunkSections.length,
          patch: hunkSections[hunkIndex],
        });
      }

      // Return full file diff
      return JSON.stringify({
        filename: entry.filename,
        status: entry.status,
        additions: entry.additions,
        deletions: entry.deletions,
        total_hunks: entry.hunks.length,
        patch: entry.patch,
      });
    } catch (err) {
      return JSON.stringify({
        error: `get_diff_for_file failed: ${(err as Error).message}`,
      });
    }
  };
}

/** Split a patch string into individual hunk sections */
function splitIntoHunks(patch: string): string[] {
  if (!patch.trim()) return [];

  const hunks: string[] = [];
  let current: string[] = [];

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@") && current.length > 0) {
      hunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0 && current.some((l) => l.trim())) {
    hunks.push(current.join("\n"));
  }

  return hunks;
}
