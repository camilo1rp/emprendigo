// ============================================================================
// PR Review Guide Bot — Multi-Agent Pipeline
// 1. Planner  (Sonnet) → Decomposes diff into analyst tasks
// 2. Analysts (Haiku)  → Parallel ReACT agents explore repo for context
// 3. Reviewer (Sonnet) → Produces structured review guide with full context
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { readConventionFiles, clearFileCache } from "./repo-tools";
import { runParallelAnalysts, type AnalystTask } from "./analyst-agent";
import { PLANNER_SYSTEM_PROMPT, parsePlannerOutput } from "./planner";
import { parseDiff, buildDiffOverview } from "./diff-tools";

// ---------------------------------------------------------------------------
// 1. STRUCTURAL TYPES
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// 2. MODEL CONFIGURATION
// ---------------------------------------------------------------------------

const PLANNER_MODEL = "claude-sonnet-4-20250514";
const REVIEWER_MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// 3. DOMAIN TYPES
// ---------------------------------------------------------------------------

interface LogicalChange {
  id: string;
  title: string;
  category: string;
  importance: "critical" | "high" | "medium" | "low" | "trivial";
  overview: string;
  locations: {
    filename: string;
    start_line: number;
    end_line: number;
    side: "RIGHT" | "LEFT";
    section_description: string;
    summary: string;
  }[];
  what_to_look_for: string[];
  red_flags: string[];
  depends_on: string[];
}

interface ReviewStep {
  step_number: number;
  title: string;
  description: string;
  change_ids: string[];
  estimated_time: string;
}

interface SkimmableChange {
  description: string;
  locations: string[];
  reason: string;
}

export interface ReviewGuide {
  pr_summary: string;
  classification: string;
  estimated_review_time: string;
  risk_level: "high" | "medium" | "low";
  logical_changes: LogicalChange[];
  review_steps: ReviewStep[];
  skimmable_changes: SkimmableChange[];
  cross_cutting_concerns: string[];
  missing_items: string[];
  file_overview: {
    filename: string;
    change_ids_present: string[];
    note: string;
  }[];
}

interface GitHubFile {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
  changes: number;
}

interface InlineComment {
  path: string;
  start_line?: number;
  line: number;
  side: "RIGHT" | "LEFT";
  body: string;
}

// ---------------------------------------------------------------------------
// 4. REVIEWER SYSTEM PROMPT
// ---------------------------------------------------------------------------

const REVIEWER_SYSTEM_PROMPT = `You are a PR Review Sub-Agent. You analyze pull request diffs and produce a structured review guide that will be posted as inline comments on GitHub to guide a human reviewer step-by-step.

You have THREE sources of information:
1. The DIFF itself (what changed)
2. REPOSITORY CONVENTIONS from files like AGENTS.md, CLAUDE.md, CONTRIBUTING.md (if they exist in the repo) — provided inside <conventions> tags
3. A CODEBASE CONTEXT REPORT from analyst agents that explored the repo for you — provided inside <codebase_context> tags

Use ALL available sources to produce a thorough, context-aware review guide. The conventions tell you about project standards and norms. The context report gives you information about existing code, callers/callees, and patterns that the diff alone doesn't show.

CRITICAL PRINCIPLE: Organize by LOGICAL CHANGE, not by file. A single file often contains multiple unrelated types of changes. Decompose the diff into logical change units, each of which may span parts of one or more files. A single file can appear in MULTIPLE logical changes.

A "logical change" is a cohesive set of modifications that serve a single purpose.

CRITICAL REQUIREMENT FOR LOCATIONS:
You are analyzing a unified diff. Each location MUST reference real line numbers from the diff.
- "start_line" and "end_line" must be ACTUAL line numbers visible in the diff hunks (the numbers after the + in @@ lines for new code, or after the - for deleted code).
- "side" must be "RIGHT" for added/modified lines (lines starting with +), "LEFT" for deleted lines (lines starting with -).
- If a logical change spans a range, use start_line and end_line to mark the range. If it's a single line, set both to the same value.
- NEVER invent line numbers. Only use line numbers that appear in the diff hunk headers or can be derived from them.
- When in doubt, anchor to the first meaningful changed line in that section of the diff.
- CRITICAL: Use the EXACT filenames from the diff headers (the "b/path/to/file" lines). Do not modify, guess, or abbreviate filenames.

The diff will be provided inside <diff> XML tags.
The codebase context will be provided inside <codebase_context> tags.

RESPOND ONLY IN JSON. No markdown, no backticks, no preamble. Follow this schema exactly:

{
  "pr_summary": "One paragraph summary of what this PR does.",
  "classification": "critical | structural | feature | bug_fix | maintenance | cosmetic | mixed",
  "estimated_review_time": "e.g. 10-15 minutes",
  "risk_level": "high | medium | low",
  "logical_changes": [
    {
      "id": "change_1",
      "title": "Short description of the logical change",
      "category": "tests | core_logic | api_contract | security | database | config | styling | documentation | formatting | dependencies | types | refactor | error_handling | performance",
      "importance": "critical | high | medium | low | trivial",
      "overview": "2-4 sentences explaining what this change does and what the reviewer should focus on. REFERENCE CONTEXT from the analysts when relevant — e.g. 'This modifies validate() which is called by 3 other services (see context).'",
      "locations": [
        {
          "filename": "path/to/file.ts",
          "start_line": 15,
          "end_line": 40,
          "side": "RIGHT",
          "section_description": "New validateEmail function",
          "summary": "What changed here and why it matters"
        }
      ],
      "what_to_look_for": ["Specific thing to verify — use context to make these more targeted"],
      "red_flags": ["Potential issue to watch for — informed by codebase context"],
      "depends_on": ["change_X"]
    }
  ],
  "review_steps": [
    {
      "step_number": 1,
      "title": "e.g. 'Understand the test expectations'",
      "description": "Why this step is ordered here and what the reviewer should accomplish.",
      "change_ids": ["change_1", "change_3"],
      "estimated_time": "5 minutes"
    }
  ],
  "skimmable_changes": [
    {
      "description": "e.g. 'Import reordering across 5 files'",
      "locations": ["path/to/file1.ts"],
      "reason": "Auto-formatted by linter, no logic changes"
    }
  ],
  "cross_cutting_concerns": ["Things that span multiple changes the reviewer should keep in mind"],
  "missing_items": ["Things that seem to be missing from the PR — informed by codebase conventions and patterns"],
  "file_overview": [
    {
      "filename": "path/to/file.ts",
      "change_ids_present": ["change_1", "change_4"],
      "note": "Brief note about mixed changes in this file"
    }
  ]
}

DECOMPOSITION RULES:
- NEVER group changes just because they're in the same file.
- DO group changes across files if they serve the same purpose (function + test + types = one change).
- ALWAYS separate formatting/whitespace from logic changes, even within the same file.
- Trivial changes (formatting, auto-generated) go in skimmable_changes, not in logical_changes.

REVIEW STEP ORDERING:
1. Tests first — they reveal intent.
2. Core business logic.
3. API contracts, database, security.
4. Error handling, edge cases.
5. Supporting changes (types, config).
6. Last: refactors, docs, cosmetic.

IMPORTANCE LEVELS:
- critical: Security, data integrity, breaking changes.
- high: Core logic, complex algorithms, error handling.
- medium: New features, moderate complexity.
- low: Config, docs, simple additions.
- trivial: Formatting, auto-generated, whitespace.

USE THE CODEBASE CONTEXT to:
- Flag when a changed function is called by many other places (high blast radius).
- Note when changes don't follow existing conventions found in AGENTS.md / CLAUDE.md.
- Identify missing tests based on existing test patterns.
- Point out when error handling doesn't match the repo's established patterns.
- Warn about potential breaking changes to callers/consumers not visible in the diff.`;

// ---------------------------------------------------------------------------
// 5. EMOJI & FORMATTING HELPERS
// ---------------------------------------------------------------------------

const IMPORTANCE_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  trivial: "⚪",
};

const CATEGORY_EMOJI: Record<string, string> = {
  tests: "🧪",
  core_logic: "⚙️",
  api_contract: "🔌",
  security: "🔒",
  database: "🗄️",
  config: "⚡",
  styling: "🎨",
  documentation: "📝",
  formatting: "✨",
  dependencies: "📦",
  types: "🏷️",
  refactor: "♻️",
  error_handling: "🛡️",
  performance: "🚀",
};

const RISK_EMOJI: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

const BOT_MARKER = "<!-- pr-review-guide-bot -->";

// ---------------------------------------------------------------------------
// 6. GITHUB API HELPERS
// ---------------------------------------------------------------------------

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function githubRequest(
  endpoint: string,
  options: RequestInit = {},
  token: string,
  retries = 2
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...GITHUB_API_HEADERS,
        ...(options.headers || {}),
      },
    });

    if (res.ok) {
      if (res.status === 204) return null;
      return res.json();
    }

    const isTransient =
      res.status === 502 || res.status === 503 || res.status === 429;
    if (isTransient && attempt < retries) {
      const retryAfter = res.headers.get("retry-after");
      const wait = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : 2000 * (attempt + 1);
      console.warn(
        `  ⚠️ GitHub API ${res.status} on ${endpoint}, retrying in ${wait}ms...`
      );
      await delay(wait);
      continue;
    }

    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  throw new Error("Request failed after all retries");
}

async function getPRDiff(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<string> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3.diff",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (res.ok) return res.text();

    const isTransient =
      res.status === 502 || res.status === 503 || res.status === 429;
    if (isTransient && attempt < 2) {
      const wait = 2000 * (attempt + 1);
      console.warn(`  ⚠️ Diff fetch ${res.status}, retrying in ${wait}ms...`);
      await delay(wait);
      continue;
    }

    const body = await res.text();
    throw new Error(`Failed to fetch diff: ${res.status} — ${body}`);
  }

  throw new Error("Failed to fetch diff after all retries");
}

async function getPRFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<GitHubFile[]> {
  const allFiles: GitHubFile[] = [];
  let page = 1;
  while (true) {
    const batch: GitHubFile[] = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      {},
      token
    );
    allFiles.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return allFiles;
}

async function getPRDetails(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
) {
  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`, {}, token);
}

// ---------------------------------------------------------------------------
// 7. CLEANUP
// ---------------------------------------------------------------------------

async function deletePreviousSummaryComments(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
) {
  try {
    let page = 1;
    while (true) {
      const comments = await githubRequest(
        `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
        {},
        token
      );
      if (!comments.length) break;
      for (const comment of comments) {
        if (comment.body?.includes(BOT_MARKER)) {
          await githubRequest(
            `/repos/${owner}/${repo}/issues/comments/${comment.id}`,
            { method: "DELETE" },
            token
          );
          await delay(100);
        }
      }
      if (comments.length < 100) break;
      page++;
    }
  } catch (err) {
    console.warn(
      `  ⚠️ Could not clean up old summary comments: ${(err as Error).message}`
    );
  }
}

async function deletePreviousInlineComments(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
) {
  try {
    let page = 1;
    while (true) {
      const comments = await githubRequest(
        `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100&page=${page}`,
        {},
        token
      );
      if (!comments.length) break;
      for (const comment of comments) {
        if (comment.body?.includes(BOT_MARKER)) {
          await githubRequest(
            `/repos/${owner}/${repo}/pulls/comments/${comment.id}`,
            { method: "DELETE" },
            token
          );
          await delay(100);
        }
      }
      if (comments.length < 100) break;
      page++;
    }
  } catch (err) {
    console.warn(
      `  ⚠️ Could not clean up old inline comments: ${(err as Error).message}`
    );
  }
}

async function cleanupPreviousRun(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
) {
  await deletePreviousSummaryComments(owner, repo, prNumber, token);
  await deletePreviousInlineComments(owner, repo, prNumber, token);
}

// ---------------------------------------------------------------------------
// 8. LINE VALIDATION
// ---------------------------------------------------------------------------

type ValidLineMap = Map<string, { left: number[]; right: number[] }>;

function buildValidLineMap(files: GitHubFile[]): ValidLineMap {
  const map: ValidLineMap = new Map();
  for (const file of files) {
    if (!file.patch) continue;
    const left: number[] = [];
    const right: number[] = [];
    const lines = file.patch.split("\n");
    let leftLine = 0;
    let rightLine = 0;
    for (const line of lines) {
      const hunkMatch = line.match(
        /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/
      );
      if (hunkMatch) {
        leftLine = parseInt(hunkMatch[1], 10);
        rightLine = parseInt(hunkMatch[2], 10);
        continue;
      }
      if (line.startsWith("-")) {
        left.push(leftLine);
        leftLine++;
      } else if (line.startsWith("+")) {
        right.push(rightLine);
        rightLine++;
      } else if (line.startsWith(" ") || line === "") {
        left.push(leftLine);
        right.push(rightLine);
        leftLine++;
        rightLine++;
      }
    }
    map.set(file.filename, {
      left: [...new Set(left)].sort((a, b) => a - b),
      right: [...new Set(right)].sort((a, b) => a - b),
    });
  }
  return map;
}

function findClosest(
  sorted: number[],
  target: number,
  maxDist: number
): number | null {
  if (sorted.length === 0) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] === target) return target;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  let best: number | null = null;
  let bestDist = Infinity;
  for (const idx of [hi, lo]) {
    if (idx >= 0 && idx < sorted.length) {
      const dist = Math.abs(sorted[idx] - target);
      if (dist < bestDist && dist <= maxDist) {
        best = sorted[idx];
        bestDist = dist;
      }
    }
  }
  return best;
}

function snapToValidLine(
  filename: string,
  requestedLine: number,
  side: "RIGHT" | "LEFT",
  validLines: ValidLineMap
): number | null {
  const fileLines = validLines.get(filename);
  if (!fileLines) return null;
  const pool = side === "RIGHT" ? fileLines.right : fileLines.left;
  return findClosest(pool, requestedLine, 20);
}

// ---------------------------------------------------------------------------
// 9. TOKEN ESTIMATION
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const MAX_DIFF_TOKENS = 100_000;

// ---------------------------------------------------------------------------
// 10. STAGE 1 — PLANNER (Sonnet)
// ---------------------------------------------------------------------------

async function planInvestigation(
  diff: string,
  prDescription: string,
  conventionDocs: string,
  anthropicApiKey: string
): Promise<{ prUnderstanding: string; tasks: AnalystTask[] }> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const userParts: string[] = [];

  if (conventionDocs) {
    userParts.push(
      `## Repository Conventions & Standards\n${conventionDocs}\n\n`
    );
  }

  if (prDescription) {
    userParts.push(`## PR Description\n${prDescription}\n\n`);
  }

  const diffTokens = estimateTokens(diff);
  if (diffTokens > 50_000) {
    userParts.push(
      `## NOTE: Large diff (~${diffTokens} tokens)\n` +
      `Focus on the highest-risk changes. Keep to 3 tasks max.\n\n`
    );
  }

  userParts.push(`## Diff\n<diff>\n${diff}\n</diff>\n\n`);
  userParts.push("Produce the analyst task decomposition JSON.");

  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 4096,
    system: PLANNER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userParts.join("") }],
  });

  console.log(
    `  📊 [Planner] API Usage: ${response.usage.input_tokens} tokens in, ${response.usage.output_tokens} tokens out`
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parsePlannerOutput(text);
}

// ---------------------------------------------------------------------------
// 11. STAGE 3 — REVIEWER (Sonnet)
// ---------------------------------------------------------------------------

async function analyzeWithClaude(
  diff: string,
  prDescription: string,
  codebaseContext: string,
  conventionDocs: string,
  anthropicApiKey: string
): Promise<ReviewGuide> {
  const diffTokens = estimateTokens(diff);
  if (diffTokens > MAX_DIFF_TOKENS) {
    throw new Error(
      `Diff is too large (~${diffTokens} tokens, max ${MAX_DIFF_TOKENS}). ` +
      `Consider splitting this PR into smaller ones.`
    );
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const userParts: string[] = [];

  if (conventionDocs) {
    userParts.push(
      `REPOSITORY CONVENTIONS:\n<conventions>\n${conventionDocs}\n</conventions>\n\n`
    );
  }

  if (prDescription) {
    userParts.push(`PR DESCRIPTION / CONTEXT:\n${prDescription}\n\n`);
  }

  userParts.push(`DIFF:\n<diff>\n${diff}\n</diff>\n\n`);

  if (codebaseContext) {
    userParts.push(
      `CODEBASE CONTEXT (from analyst agents):\n<codebase_context>\n${codebaseContext}\n</codebase_context>\n\n`
    );
  }

  userParts.push(
    "Decompose this diff into logical changes (NOT by file) and produce the structured review guide JSON."
  );

  const response = await client.messages.create({
    model: REVIEWER_MODEL,
    max_tokens: 8192,
    system: REVIEWER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userParts.join("") }],
  });

  console.log(
    `  📊 [Reviewer] API Usage: ${response.usage.input_tokens} tokens in, ${response.usage.output_tokens} tokens out`
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Claude response was truncated (max_tokens reached). " +
      "The PR may be too large for single-pass analysis."
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as ReviewGuide;
  } catch (e) {
    throw new Error(
      `Failed to parse Claude response as JSON: ${(e as Error).message}\n` +
      `Raw response (first 500 chars): ${clean.slice(0, 500)}`
    );
  }
}

// ---------------------------------------------------------------------------
// 12. BUILD GITHUB COMMENTS
// ---------------------------------------------------------------------------

function buildSummaryComment(guide: ReviewGuide): string {
  const risk = RISK_EMOJI[guide.risk_level] || "⚪";
  const lines: string[] = [];

  lines.push(BOT_MARKER);
  lines.push(`## 🔍 PR Review Guide`);
  lines.push("");
  lines.push(
    `${risk} **Risk:** ${guide.risk_level} · **Type:** ${guide.classification} · **Est. review time:** ${guide.estimated_review_time}`
  );
  lines.push("");
  lines.push(`### Summary`);
  lines.push(guide.pr_summary);
  lines.push("");

  lines.push(`### 📋 Review Order`);
  lines.push("");
  lines.push(
    `Follow these steps in order. Each step has inline comments on the relevant code.`
  );
  lines.push("");

  for (const step of guide.review_steps) {
    const changeIds = step.change_ids || [];
    const changes = guide.logical_changes.filter((c) =>
      changeIds.includes(c.id)
    );
    const maxImp =
      ["critical", "high", "medium", "low", "trivial"].find((lvl) =>
        changes.some((c) => c.importance === lvl)
      ) || "medium";
    const emoji = IMPORTANCE_EMOJI[maxImp] || "⚪";

    lines.push(
      `- [ ] **Step ${step.step_number}: ${step.title}** ${emoji} _(${step.estimated_time})_`
    );
    lines.push(`  ${step.description}`);

    for (const c of changes) {
      const catEmoji = CATEGORY_EMOJI[c.category] || "📄";
      const files = Array.from(new Set(c.locations.map((l) => `\`${l.filename}\``))).join(", ");
      lines.push(`  - ${catEmoji} ${c.title} → ${files}`);
    }
    lines.push("");
  }

  if (guide.skimmable_changes?.length) {
    lines.push(`### ⏭️ Skimmable (low priority)`);
    lines.push("");
    for (const s of guide.skimmable_changes) {
      lines.push(`- **${s.description}** — _${s.reason}_`);
      lines.push(
        `  Files: ${Array.from(new Set(s.locations.map((l) => `\`${l}\``))).join(", ")}`
      );
    }
    lines.push("");
  }

  if (guide.missing_items?.length) {
    lines.push(`### ⚠️ Potentially Missing`);
    lines.push("");
    for (const m of guide.missing_items) {
      lines.push(`- ${m}`);
    }
    lines.push("");
  }

  if (guide.cross_cutting_concerns?.length) {
    lines.push(`### 🔗 Cross-Cutting Concerns`);
    lines.push("");
    for (const c of guide.cross_cutting_concerns) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  const mixedFiles =
    guide.file_overview?.filter((f) => f.change_ids_present?.length > 1) || [];
  if (mixedFiles.length) {
    lines.push(`### 🔀 Files with Mixed Changes`);
    lines.push("");
    lines.push(
      `These files contain multiple unrelated changes. Don't review top-to-bottom — follow the step comments instead.`
    );
    lines.push("");
    for (const f of mixedFiles) {
      lines.push(`- \`${f.filename}\` — ${f.note}`);
    }
    lines.push("");
  }

  lines.push(`---\n_Generated by PR Review Guide Bot (multi-agent)_`);

  return lines.join("\n");
}

function buildInlineComments(
  guide: ReviewGuide,
  validLines: ValidLineMap
): InlineComment[] {
  const comments: InlineComment[] = [];

  const changeToStep = new Map<string, ReviewStep>();
  for (const step of guide.review_steps) {
    for (const cid of step.change_ids || []) {
      changeToStep.set(cid, step);
    }
  }

  for (const change of guide.logical_changes) {
    const step = changeToStep.get(change.id);
    const impEmoji = IMPORTANCE_EMOJI[change.importance] || "⚪";
    const catEmoji = CATEGORY_EMOJI[change.category] || "📄";

    for (let i = 0; i < change.locations.length; i++) {
      const loc = change.locations[i];
      const isPrimary = i === 0;

      if (!validLines.has(loc.filename)) {
        console.warn(
          `  ⚠️ Skipping comment: file "${loc.filename}" not found in diff`
        );
        continue;
      }

      const validLine = snapToValidLine(
        loc.filename,
        loc.end_line,
        loc.side,
        validLines
      );
      if (validLine === null) {
        console.warn(
          `  ⚠️ Skipping comment: no valid line near ${loc.end_line} in "${loc.filename}"`
        );
        continue;
      }

      const body: string[] = [];
      body.push(BOT_MARKER);

      const headerTitle = step
        ? `${impEmoji} **Step ${step.step_number} · ${catEmoji} ${change.title}**`
        : `${impEmoji} ${catEmoji} **${change.title}**`;

      if (isPrimary) {
        // --- PRIMARY LOCATION (Full Comment) ---
        body.push(headerTitle);
        body.push("");
        body.push(`> **${loc.section_description}**: ${loc.summary}`);
        body.push("");
        body.push(change.overview);

        if (change.what_to_look_for?.length) {
          body.push("");
          body.push("**🔎 Verify:**");
          for (const item of change.what_to_look_for) {
            body.push(`- [ ] ${item}`);
          }
        }

        if (change.red_flags?.filter(Boolean).length) {
          body.push("");
          body.push("**⚠️ Watch for:**");
          for (const flag of change.red_flags.filter(Boolean)) {
            body.push(`- ${flag}`);
          }
        }

        if (change.depends_on?.filter(Boolean).length) {
          const depTitles = change.depends_on
            .map((depId) => {
              const dep = guide.logical_changes.find((c) => c.id === depId);
              return dep ? dep.title : depId;
            })
            .join(", ");
          body.push("");
          body.push(`_ℹ️ Review after: ${depTitles}_`);
        }

        // Add cross-references to secondary locations
        if (change.locations.length > 1) {
          body.push("");
          body.push("**Also applies to:**");
          for (let j = 1; j < change.locations.length; j++) {
            const secLoc = change.locations[j];
            body.push(`- \`${secLoc.filename}\` (L${secLoc.end_line})`);
          }
        }
      } else {
        // --- SECONDARY LOCATION (Truncated Comment) ---
        body.push(headerTitle);
        body.push("");
        body.push(`> **${loc.section_description}**: ${loc.summary}`);
        body.push("");

        const primaryFile = change.locations[0].filename;
        body.push(`_See the primary comment on \`${primaryFile}\` for the full review checklist for this logical change._`);
      }

      const comment: InlineComment = {
        path: loc.filename,
        line: validLine,
        side: loc.side,
        body: body.join("\n"),
      };

      if (loc.start_line < loc.end_line) {
        const validStart = snapToValidLine(
          loc.filename,
          loc.start_line,
          loc.side,
          validLines
        );
        if (validStart !== null && validStart < validLine) {
          comment.start_line = validStart;
        }
      }

      comments.push(comment);
    }
  }

  return comments;
}

// ---------------------------------------------------------------------------
// 13. POST TO GITHUB
// ---------------------------------------------------------------------------

async function postCommentsInBatches(
  comments: InlineComment[],
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  token: string
): Promise<{ posted: number; failed: number }> {
  let posted = 0;
  let failed = 0;
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 500;

  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    const batch = comments.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((comment) =>
        githubRequest(
          `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
          {
            method: "POST",
            body: JSON.stringify({
              commit_id: commitSha,
              path: comment.path,
              line: comment.line,
              side: comment.side,
              ...(comment.start_line !== undefined && {
                start_line: comment.start_line,
                start_side: comment.side,
              }),
              body: comment.body,
            }),
          },
          token
        )
      )
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        posted++;
      } else {
        failed++;
        const c = batch[j];
        const reason = (results[j] as PromiseRejectedResult).reason;
        console.warn(
          `  ⚠️ Failed: ${c.path}:${c.line} — ${reason?.message || reason}`
        );
      }
    }

    if (i + BATCH_SIZE < comments.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return { posted, failed };
}

async function postReviewGuide(
  owner: string,
  repo: string,
  prNumber: number,
  guide: ReviewGuide,
  validLines: ValidLineMap,
  commitSha: string,
  token: string
) {
  console.log(`  🧹 Cleaning up previous review guide...`);
  await cleanupPreviousRun(owner, repo, prNumber, token);

  const summaryBody = buildSummaryComment(guide);
  await githubRequest(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body: summaryBody }),
    },
    token
  );

  const inlineComments = buildInlineComments(guide, validLines);

  if (inlineComments.length > 0) {
    const { posted, failed } = await postCommentsInBatches(
      inlineComments,
      owner,
      repo,
      prNumber,
      commitSha,
      token
    );
    console.log(
      `✅ Posted summary + ${posted} inline comments` +
      (failed > 0 ? ` (${failed} failed)` : "") +
      `.`
    );
  } else {
    console.log(`✅ Posted summary. No inline comments to post.`);
  }
}

// ---------------------------------------------------------------------------
// 14. EMPTY GUIDE HELPER
// ---------------------------------------------------------------------------

function emptyGuide(): ReviewGuide {
  return {
    pr_summary: "No changes detected.",
    classification: "cosmetic",
    estimated_review_time: "0 minutes",
    risk_level: "low",
    logical_changes: [],
    review_steps: [],
    skimmable_changes: [],
    cross_cutting_concerns: [],
    missing_items: [],
    file_overview: [],
  };
}

// ---------------------------------------------------------------------------
// 15. MAIN ENTRY POINT — MULTI-AGENT PIPELINE
// ---------------------------------------------------------------------------

export async function run(config: {
  owner: string;
  repo: string;
  prNumber: number;
  githubToken: string;
  anthropicApiKey: string;
  repoRoot?: string;
}): Promise<ReviewGuide> {
  const {
    owner, repo, prNumber, githubToken, anthropicApiKey,
    repoRoot = process.cwd(),
  } = config;

  console.log(`🔍 Analyzing PR #${prNumber} in ${owner}/${repo}...`);

  // 1. Fetch PR data
  const [diff, files, prDetails] = await Promise.all([
    getPRDiff(owner, repo, prNumber, githubToken),
    getPRFiles(owner, repo, prNumber, githubToken),
    getPRDetails(owner, repo, prNumber, githubToken),
  ]);

  const prDescription = prDetails.body || "";
  const commitSha = prDetails.head.sha;

  if (!diff.trim()) {
    console.log(`  ℹ️ PR has no diff. Skipping.`);
    return emptyGuide();
  }

  const validLines = buildValidLineMap(files);

  // 2. Parse diff ONCE — used by overview, diff tool, and reviewer
  console.log(`  📄 Parsing diff: ${files.length} files, ~${diff.length} chars`);
  const diffEntries = parseDiff(diff);
  const diffOverview = buildDiffOverview(diffEntries);

  const overviewTokens = estimateTokens(diffOverview);
  const fullDiffTokens = estimateTokens(diff);
  console.log(
    `  📊 Diff overview: ~${overviewTokens} tokens (vs ~${fullDiffTokens} full, ` +
    `${Math.round((1 - overviewTokens / fullDiffTokens) * 100)}% reduction)`
  );

  // 3. Read convention files
  console.log(`  📖 Checking for convention files...`);
  const conventions = await readConventionFiles(repoRoot);
  if (conventions.files.length > 0) {
    console.log(`  ✅ Found: ${conventions.files.map((f) => f.name).join(", ")}`);
  }

  // 4. STAGE 1 — Planner: decompose into analyst tasks (gets FULL diff)
  console.log(`  📋 Stage 1: Planning analyst tasks...`);
  let analystTasks: AnalystTask[] = [];

  try {
    const plan = await planInvestigation(
      diff, prDescription, conventions.formatted, anthropicApiKey
    );
    analystTasks = plan.tasks;
    if (analystTasks.length === 0) {
      console.warn(`  ⚠️ Planner produced no valid tasks. Falling back to direct review.`);
      const guide = await analyzeWithClaude(
        diff, prDescription, "", conventions.formatted, anthropicApiKey
      );
      await postReviewGuide(owner, repo, prNumber, guide, validLines, commitSha, githubToken);
      clearFileCache();
      return guide;
    }
    console.log(
      `  ✅ Planner: ${analystTasks.length} tasks → ` +
      analystTasks.map((t) => `${t.id}(${t.priority})`).join(", ")
    );
  } catch (err) {
    console.warn(`  ⚠️ Planner failed: ${(err as Error).message}. Direct review fallback.`);
    const guide = await analyzeWithClaude(
      diff, prDescription, "", conventions.formatted, anthropicApiKey
    );
    await postReviewGuide(owner, repo, prNumber, guide, validLines, commitSha, githubToken);
    clearFileCache();
    return guide;
  }

  // 5. STAGE 2 — Parallel analysts (get OVERVIEW + diff tool, NOT full diff)
  console.log(`  🔬 Stage 2: ${analystTasks.length} analysts in parallel...`);
  let codebaseContext = "";

  try {
    const result = await runParallelAnalysts({
      anthropicApiKey,
      repoRoot,
      diffOverview,
      diffEntries,
      tasks: analystTasks,
      conventionDocs: conventions.formatted,
    });

    codebaseContext = result.mergedContext;

    console.log(
      `  ✅ Analysts done: ${result.totalToolCalls} tool calls, ` +
      `${result.totalDurationMs}ms wall time` +
      (result.failedTasks.length > 0
        ? ` (${result.failedTasks.length} failed)`
        : "")
    );
  } catch (err) {
    console.warn(
      `  ⚠️ Analysts failed: ${(err as Error).message}. Diff-only fallback.`
    );
  }

  // 6. STAGE 3 — Reviewer (gets FULL diff for line-number accuracy)
  console.log(`  🤖 Stage 3: Review guide...`);
  const guide = await analyzeWithClaude(
    diff, prDescription, codebaseContext, conventions.formatted, anthropicApiKey
  );
  console.log(
    `  ✅ ${guide.logical_changes.length} changes, ${guide.review_steps.length} steps`
  );

  // 7. Post to GitHub
  console.log(`  💬 Posting...`);
  await postReviewGuide(
    owner, repo, prNumber, guide, validLines, commitSha, githubToken
  );
  clearFileCache();

  console.log(`🎉 Done!`);
  return guide;
}
