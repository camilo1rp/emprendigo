// ============================================================================
// PR Review Guide Bot — GitHub Action
// Posts ordered, inline review comments to guide human reviewers step-by-step.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// 1. TYPES
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

interface ReviewGuide {
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

interface ReviewComment {
  path: string;
  start_line?: number;
  line: number;
  side: "RIGHT" | "LEFT";
  body: string;
}

// ---------------------------------------------------------------------------
// 2. SYSTEM PROMPT
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a PR Review Sub-Agent. You analyze pull request diffs and produce a structured review guide that will be posted as inline comments on GitHub to guide a human reviewer step-by-step.

CRITICAL PRINCIPLE: Organize by LOGICAL CHANGE, not by file. A single file often contains multiple unrelated types of changes. Decompose the diff into logical change units, each of which may span parts of one or more files. A single file can appear in MULTIPLE logical changes.

A "logical change" is a cohesive set of modifications that serve a single purpose.

CRITICAL REQUIREMENT FOR LOCATIONS:
You are analyzing a unified diff. Each location MUST reference real line numbers from the diff.
- "start_line" and "end_line" must be ACTUAL line numbers visible in the diff hunks (the numbers after the + in @@ lines for new code, or after the - for deleted code).
- "side" must be "RIGHT" for added/modified lines (lines starting with +), "LEFT" for deleted lines (lines starting with -).
- If a logical change spans a range, use start_line and end_line to mark the range. If it's a single line, set both to the same value.
- NEVER invent line numbers. Only use line numbers that appear in the diff hunk headers or can be derived from them.
- When in doubt, anchor to the first meaningful changed line in that section of the diff.

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
      "overview": "2-4 sentences explaining what this change does and what the reviewer should focus on.",
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
      "what_to_look_for": ["Specific thing to verify"],
      "red_flags": ["Potential issue to watch for"],
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
  "missing_items": ["Things that seem to be missing from the PR"],
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
- trivial: Formatting, auto-generated, whitespace.`;

// ---------------------------------------------------------------------------
// 3. EMOJI & FORMATTING HELPERS
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

// ---------------------------------------------------------------------------
// 4. GITHUB API HELPERS
// ---------------------------------------------------------------------------

async function githubRequest(
  endpoint: string,
  options: RequestInit = {},
  token: string
) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  return res.json();
}

async function getPRDiff(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3.diff",
      },
    }
  );
  return res.text();
}

async function getPRFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<GitHubFile[]> {
  return githubRequest(
    `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    {},
    token
  );
}

async function getPRDetails(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
) {
  return githubRequest(
    `/repos/${owner}/${repo}/pulls/${prNumber}`,
    {},
    token
  );
}

async function getLatestCommitSha(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<string> {
  const pr = await getPRDetails(owner, repo, prNumber, token);
  return pr.head.sha;
}

// ---------------------------------------------------------------------------
// 5. LINE NUMBER VALIDATION
// ---------------------------------------------------------------------------

/** Parse diff hunks to build a map of valid commentable lines per file */
function buildValidLineMap(
  files: GitHubFile[]
): Map<string, { left: Set<number>; right: Set<number> }> {
  const map = new Map<
    string,
    { left: Set<number>; right: Set<number> }
  >();

  for (const file of files) {
    if (!file.patch) continue;

    const left = new Set<number>();
    const right = new Set<number>();
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
        left.add(leftLine);
        leftLine++;
      } else if (line.startsWith("+")) {
        right.add(rightLine);
        rightLine++;
      } else {
        // Context line — valid on both sides
        left.add(leftLine);
        right.add(rightLine);
        leftLine++;
        rightLine++;
      }
    }

    map.set(file.filename, { left, right });
  }

  return map;
}

/** Snap a requested line to the nearest valid diff line */
function snapToValidLine(
  filename: string,
  requestedLine: number,
  side: "RIGHT" | "LEFT",
  validLines: Map<string, { left: Set<number>; right: Set<number> }>
): number | null {
  const fileLines = validLines.get(filename);
  if (!fileLines) return null;

  const pool = side === "RIGHT" ? fileLines.right : fileLines.left;
  if (pool.has(requestedLine)) return requestedLine;

  // Find closest valid line within ±20 lines
  const sorted = [...pool].sort((a, b) => a - b);
  let best: number | null = null;
  let bestDist = Infinity;

  for (const l of sorted) {
    const dist = Math.abs(l - requestedLine);
    if (dist < bestDist && dist <= 20) {
      best = l;
      bestDist = dist;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// 6. ANALYZE WITH CLAUDE
// ---------------------------------------------------------------------------

async function analyzeWithClaude(
  diff: string,
  prDescription: string,
  anthropicApiKey: string
): Promise<ReviewGuide> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const userMessage = [
    "Here is the PR diff to analyze:\n",
    prDescription
      ? `PR DESCRIPTION / CONTEXT:\n${prDescription}\n\n`
      : "",
    `DIFF:\n\`\`\`\n${diff}\n\`\`\``,
    "\nDecompose this diff into logical changes (NOT by file) and produce the structured review guide JSON.",
  ].join("");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as ReviewGuide;
}

// ---------------------------------------------------------------------------
// 7. BUILD GITHUB REVIEW COMMENTS
// ---------------------------------------------------------------------------

function buildSummaryComment(guide: ReviewGuide): string {
  const risk = RISK_EMOJI[guide.risk_level] || "⚪";
  const lines: string[] = [];

  lines.push(`## 🔍 PR Review Guide`);
  lines.push("");
  lines.push(`${risk} **Risk:** ${guide.risk_level} · **Type:** ${guide.classification} · **Est. review time:** ${guide.estimated_review_time}`);
  lines.push("");
  lines.push(`### Summary`);
  lines.push(guide.pr_summary);
  lines.push("");

  // Review steps as ordered checklist
  lines.push(`### 📋 Review Order`);
  lines.push("");
  lines.push(`Follow these steps in order. Each step has inline comments on the relevant code.`);
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
      const files = c.locations.map((l) => `\`${l.filename}\``).join(", ");
      lines.push(`  - ${catEmoji} ${c.title} → ${files}`);
    }

    lines.push("");
  }

  // Skimmable
  if (guide.skimmable_changes?.length) {
    lines.push(`### ⏭️ Skimmable (low priority)`);
    lines.push("");
    for (const s of guide.skimmable_changes) {
      lines.push(`- **${s.description}** — _${s.reason}_`);
      lines.push(
        `  Files: ${s.locations.map((l) => `\`${l}\``).join(", ")}`
      );
    }
    lines.push("");
  }

  // Missing items
  if (guide.missing_items?.length) {
    lines.push(`### ⚠️ Potentially Missing`);
    lines.push("");
    for (const m of guide.missing_items) {
      lines.push(`- ${m}`);
    }
    lines.push("");
  }

  // Cross-cutting
  if (guide.cross_cutting_concerns?.length) {
    lines.push(`### 🔗 Cross-Cutting Concerns`);
    lines.push("");
    for (const c of guide.cross_cutting_concerns) {
      lines.push(`- ${c}`);
    }
    lines.push("");
  }

  // Mixed-change files
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

  lines.push(
    `---\n_Generated by PR Review Guide Bot · Review comments are posted inline on the relevant code._`
  );

  return lines.join("\n");
}

function buildInlineComments(
  guide: ReviewGuide,
  validLines: Map<string, { left: Set<number>; right: Set<number> }>
): ReviewComment[] {
  const comments: ReviewComment[] = [];

  // Build a map: change_id → which step it belongs to
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

    for (const loc of change.locations) {
      const validLine = snapToValidLine(
        loc.filename,
        loc.end_line,
        loc.side,
        validLines
      );

      if (validLine === null) continue; // Can't place this comment

      // Build the comment body
      const body: string[] = [];

      // Header with step number
      if (step) {
        body.push(
          `${impEmoji} **Step ${step.step_number} · ${catEmoji} ${change.title}**`
        );
      } else {
        body.push(`${impEmoji} ${catEmoji} **${change.title}**`);
      }

      body.push("");
      body.push(`> ${loc.summary}`);
      body.push("");
      body.push(change.overview);

      // What to look for
      if (change.what_to_look_for?.length) {
        body.push("");
        body.push("**🔎 Verify:**");
        for (const item of change.what_to_look_for) {
          body.push(`- [ ] ${item}`);
        }
      }

      // Red flags
      if (change.red_flags?.filter(Boolean).length) {
        body.push("");
        body.push("**⚠️ Watch for:**");
        for (const flag of change.red_flags.filter(Boolean)) {
          body.push(`- ${flag}`);
        }
      }

      // Dependencies
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

      const comment: ReviewComment = {
        path: loc.filename,
        line: validLine,
        side: loc.side,
        body: body.join("\n"),
      };

      // Add start_line for multi-line comments if valid
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
// 8. POST THE REVIEW TO GITHUB
// ---------------------------------------------------------------------------

async function postReview(
  owner: string,
  repo: string,
  prNumber: number,
  guide: ReviewGuide,
  validLines: Map<string, { left: Set<number>; right: Set<number> }>,
  commitSha: string,
  token: string
) {
  const summaryBody = buildSummaryComment(guide);
  const inlineComments = buildInlineComments(guide, validLines);

  // Post as a single PR review (summary + inline comments in one call)
  // This groups everything under one review, which is cleaner than separate comments.
  await githubRequest(
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    {
      method: "POST",
      body: JSON.stringify({
        commit_id: commitSha,
        body: summaryBody,
        event: "COMMENT", // COMMENT = neutral, doesn't approve or request changes
        comments: inlineComments,
      }),
    },
    token
  );

  console.log(
    `✅ Posted review with ${inlineComments.length} inline comments.`
  );
}

// ---------------------------------------------------------------------------
// 9. MAIN ENTRY POINT
// ---------------------------------------------------------------------------

export async function run(config: {
  owner: string;
  repo: string;
  prNumber: number;
  githubToken: string;
  anthropicApiKey: string;
}) {
  const { owner, repo, prNumber, githubToken, anthropicApiKey } = config;

  console.log(`🔍 Analyzing PR #${prNumber} in ${owner}/${repo}...`);

  // 1. Fetch PR data
  const [diff, files, prDetails, commitSha] = await Promise.all([
    getPRDiff(owner, repo, prNumber, githubToken),
    getPRFiles(owner, repo, prNumber, githubToken),
    getPRDetails(owner, repo, prNumber, githubToken),
    getLatestCommitSha(owner, repo, prNumber, githubToken),
  ]);

  const prDescription = prDetails.body || "";
  console.log(
    `  📄 ${files.length} files changed, diff is ~${diff.length} chars`
  );

  // 2. Build valid line map for comment placement
  const validLines = buildValidLineMap(files);

  // 3. Analyze with Claude
  console.log(`  🤖 Sending to Claude for analysis...`);
  const guide = await analyzeWithClaude(diff, prDescription, anthropicApiKey);
  console.log(
    `  ✅ Got ${guide.logical_changes.length} logical changes in ${guide.review_steps.length} steps`
  );

  // 4. Post review to GitHub
  console.log(`  💬 Posting review to GitHub...`);
  await postReview(
    owner,
    repo,
    prNumber,
    guide,
    validLines,
    commitSha,
    githubToken
  );

  console.log(`🎉 Done!`);
  return guide;
}

// ---------------------------------------------------------------------------
// 10. GITHUB ACTION ENTRYPOINT (if running as an action)
// ---------------------------------------------------------------------------

// Uncomment this block when running as a GitHub Action:
//
// import * as core from "@actions/core";
// import * as github from "@actions/github";
//
// async function main() {
//   try {
//     const token = core.getInput("github-token", { required: true });
//     const anthropicKey = core.getInput("anthropic-api-key", { required: true });
//     const context = github.context;
//
//     if (!context.payload.pull_request) {
//       core.setFailed("This action only works on pull_request events.");
//       return;
//     }
//
//     await run({
//       owner: context.repo.owner,
//       repo: context.repo.repo,
//       prNumber: context.payload.pull_request.number,
//       githubToken: token,
//       anthropicApiKey: anthropicKey,
//     });
//   } catch (err: any) {
//     core.setFailed(err.message);
//   }
// }
//
// main();
