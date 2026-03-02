// ============================================================================
// analyst-agent.ts — Parallel multi-analyst architecture
// Each analyst receives a LIGHTWEIGHT diff overview and can pull
// detailed patches on-demand via get_diff_for_file.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import {
  TOOL_DEFINITIONS as REPO_TOOL_DEFINITIONS,
  executeTool as executeRepoTool,
} from "./repo-tools";
import {
  type FileDiffEntry,
  DIFF_TOOL_DEFINITION,
  createDiffToolExecutor,
} from "./diff-tools";

// ---------------------------------------------------------------------------
// 1. TYPES
// ---------------------------------------------------------------------------



interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export interface AnalystTask {
  id: string;
  title: string;
  concern_type:
  | "blast_radius"
  | "conventions"
  | "test_coverage"
  | "error_handling"
  | "security"
  | "dependencies"
  | "architecture"
  | "data_integrity"
  | "other";
  priority: "critical" | "high" | "medium";
  scope: string;
  questions: string[];
  suggested_files: string[];
  suggested_searches: { filepath: string; pattern: string }[];
  max_tool_calls?: number;
}

export interface SingleAnalystResult {
  taskId: string;
  taskTitle: string;
  concernType: string;
  priority: string;
  summary: string;
  iterations: number;
  toolCalls: number;
  earlyStop: boolean;
  stopReason: string;
  durationMs: number;
}

export interface ParallelAnalystResult {
  analysts: SingleAnalystResult[];
  mergedContext: string;
  totalToolCalls: number;
  totalDurationMs: number;
  failedTasks: string[];
}

// ---------------------------------------------------------------------------
// 2. CONFIGURATION
// ---------------------------------------------------------------------------

const ANALYST_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_ITERATIONS = 20;
const MAX_TOOL_RESULT_CHARS = 16_000;
const MAX_TOTAL_TOOL_RESULT_CHARS = 70_000;
const MAX_PARALLEL_ANALYSTS = 5;
const ANALYST_TIMEOUT_MS = 300_000; // 5 minutes

// Combine repo tools + diff tool into a single array
const ALL_TOOL_DEFINITIONS = [...REPO_TOOL_DEFINITIONS, DIFF_TOOL_DEFINITION];

// ---------------------------------------------------------------------------
// 3. SINGLE ANALYST SYSTEM PROMPT
// ---------------------------------------------------------------------------

function buildAnalystSystemPrompt(task: AnalystTask): string {
  const maxIter = task.max_tool_calls || DEFAULT_MAX_ITERATIONS;

  return `You are a focused Code Analyst Agent investigating ONE specific concern in a pull request.

## YOUR ASSIGNMENT
**Concern:** ${task.title}
**Type:** ${task.concern_type}
**Priority:** ${task.priority}

You are ONE of several analysts running in parallel. Other analysts cover other concerns.
DO NOT investigate anything outside your assigned scope. Stay focused.

## YOUR SCOPE
${task.scope}

## QUESTIONS TO ANSWER
${task.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

## WHAT YOU HAVE
- A **diff overview** showing which files changed, stats (+/-), and hunk headers (which functions were touched). This is NOT the full diff.
- Convention files if the repo has them.
- Suggested starting points from the planner.

## TOOL STRATEGY (budget: ~${maxIter} tool calls)

### Understanding the changes (use get_diff_for_file)
- You start with only the diff OVERVIEW (file list + hunk headers). To see actual code changes, call **get_diff_for_file(filename)**.
- ONLY pull diffs for files relevant to YOUR concern. Don't read every file.
- Use the hunk_index parameter if a file has many hunks and you only need one section.

### Exploring the codebase (use repo tools)
- **search_in_file**: Use SPECIFIC identifiers (function names, class names) from the diff or hunk headers. Never search generic words.
- **get_lines**: Read specific line ranges. Max 100 lines per call. Use after search to get context.
- **list_files**: Understand directory structure, find related files.
- **get_file_info**: Quick check if a file exists and its size.

### Efficient workflow
1. Start with get_diff_for_file on the most relevant file(s) to understand WHAT changed.
2. Then use repo tools to understand the IMPACT (callers, patterns, conventions).
3. Don't read the diff for files outside your scope.
4. Don't re-read something you've already seen.

## REASONING PROCESS
Follow a strict Thought → Action → Observation loop:

<thought>
- Which question am I working on?
- What do I know so far? What's missing?
- What's the most efficient next action?
- Questions answered: [list]
- Questions remaining: [list]
</thought>

Then make ONE tool call. After receiving results, reflect before acting again.

## STOPPING RULES
Stop and write your summary when:
1. All your assigned questions have answers (even "not found / could not determine").
2. Last 2 tool calls added no new information.
3. You're approaching your tool call budget.

## OUTPUT FORMAT
When done, respond with ONLY your summary (no tool calls):

## ${task.title}

### Findings
For each question:
#### Q: [question text]
**Answer:** (concise finding)
**Evidence:** (file:line references)
**Confidence:** high | medium | low

### Key Insights
(The most important things for a reviewer, specific to your concern area)

### Risks Found
(Anything risky or inconsistent — be specific with file:line references)
(Write "None identified" if you found nothing concerning)

IMPORTANT: You are a fact-finder, not a reviewer. Report what you find with evidence.`;
}

// ---------------------------------------------------------------------------
// 4. TOOL EXECUTOR — dispatches to repo tools or diff tool
// ---------------------------------------------------------------------------

function createToolExecutor(
  repoRoot: string,
  diffEntries: FileDiffEntry[]
): (toolName: string, input: Record<string, any>) => Promise<string> {
  const diffToolExec = createDiffToolExecutor(diffEntries);

  return async (toolName: string, input: Record<string, any>) => {
    if (toolName === "get_diff_for_file") {
      return diffToolExec(input);
    }
    return executeRepoTool(repoRoot, toolName, input);
  };
}

// ---------------------------------------------------------------------------
// 5. SINGLE ANALYST REACT LOOP
// ---------------------------------------------------------------------------

async function runSingleAnalyst(config: {
  client: Anthropic;
  repoRoot: string;
  diffOverview: string;
  diffEntries: FileDiffEntry[];
  task: AnalystTask;
  conventionDocs: string;
}): Promise<SingleAnalystResult> {
  const { client, repoRoot, diffOverview, diffEntries, task, conventionDocs } =
    config;
  const maxIterations = task.max_tool_calls || DEFAULT_MAX_ITERATIONS;
  const startTime = Date.now();

  const executeTool = createToolExecutor(repoRoot, diffEntries);

  // Build initial user message — lightweight
  const userParts: string[] = [];

  if (conventionDocs) {
    userParts.push(
      `## Repository Conventions (pre-loaded)\n${conventionDocs}\n`
    );
  }

  // The key optimization: overview instead of full diff
  userParts.push(diffOverview);

  if (task.suggested_files.length > 0) {
    userParts.push(
      `\n## Suggested Starting Points\nFiles: ${task.suggested_files.join(", ")}`
    );
  }

  if (task.suggested_searches.length > 0) {
    userParts.push(
      `\n## Suggested Searches\n` +
      task.suggested_searches
        .map((s) => `- search_in_file("${s.filepath}", "${s.pattern}")`)
        .join("\n")
    );
  }

  userParts.push(
    `\nInvestigate your assigned concern using the tools. ` +
    `Use get_diff_for_file to see actual changes in specific files. ` +
    `When you have enough context, write your final summary.`
  );

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userParts.join("\n") },
  ];

  const systemPrompt = buildAnalystSystemPrompt(task);
  let iterations = 0;
  let toolCallCount = 0;
  let totalToolResultChars = 0;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: ANALYST_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: ALL_TOOL_DEFINITIONS as any,
      messages,
    });

    console.log(
      `       [${task.id}] 🧠 Iter ${iterations}/${maxIterations} | Tokens: ${response.usage.input_tokens}↓ ${response.usage.output_tokens}↑`
    );

    // --- Handle truncated response ---
    if (response.stop_reason === "max_tokens") {
      const summary = await forceAnalystSummary(
        client,
        systemPrompt,
        messages,
        response
      );
      return buildResult(task, summary, iterations, toolCallCount, true, "max_tokens", startTime);
    }

    // --- Agent is done (no tool calls) ---
    const hasToolUse = response.content.some((b) => b.type === "tool_use");

    if (!hasToolUse) {
      console.log(`       [${task.id}] ✨ Analyst completed assigned task in ${iterations} iterations.`);
      return buildResult(
        task, extractText(response), iterations, toolCallCount, false, "complete", startTime
      );
    }

    // --- Process tool calls ---
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent as any });

    const toolResults: ToolResultBlock[] = [];

    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;

      toolCallCount++;
      console.log(
        `       [${task.id}] 🔧 ${block.name}(${truncateJSON(block.input as Record<string, any>)})`
      );

      const tStart = Date.now();
      let result = await executeTool(
        block.name,
        block.input as Record<string, any>
      );
      const toolMs = Date.now() - tStart;

      if (result.length > MAX_TOOL_RESULT_CHARS) {
        result =
          result.slice(0, MAX_TOOL_RESULT_CHARS) +
          `\n...[TRUNCATED — ${result.length} chars. Use more specific queries.]`;
      }

      console.log(
        `       [${task.id}] ⏱️  ${block.name} finished in ${toolMs}ms (returned ${result.length} chars)`
      );

      totalToolResultChars += result.length;

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    // --- Check budgets ---
    const overBudget = totalToolResultChars > MAX_TOTAL_TOOL_RESULT_CHARS;
    const overIterations = iterations >= maxIterations;

    if (overBudget || overIterations) {
      console.log(
        `       [${task.id}] 🛑 Budgets exceeded (Over Budget: ${overBudget}, Over Iters: ${overIterations}). Forcing summary.`
      );
      const reason = overBudget ? "context_budget" : "max_iterations";

      messages.push({
        role: "user",
        content: [
          ...toolResults,
          {
            type: "text" as const,
            text: `You've reached your ${overBudget ? "context" : "tool call"} limit. Write your final summary NOW. No more tool calls.`,
          },
        ],
      });

      // Prevent further tool usage by forcing text output, but retain tools definition
      const finalResponse = await client.messages.create({
        model: ANALYST_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: ALL_TOOL_DEFINITIONS as any,
        tool_choice: { type: "none" },
        messages,
      });

      const textOutput = extractText(finalResponse);
      const output = textOutput.trim() ? textOutput : "(Response contained only tool calls, no summary provided)";

      return buildResult(
        task, output, iterations, toolCallCount, true, reason, startTime
      );
    }

    // --- Continue loop ---
    messages.push({ role: "user", content: toolResults as any });
  }

  return buildResult(
    task, "Analyst completed without producing a summary.",
    iterations, toolCallCount, true, "unexpected_exit", startTime
  );
}

// ---------------------------------------------------------------------------
// 6. PARALLEL ORCHESTRATOR
// ---------------------------------------------------------------------------

export async function runParallelAnalysts(config: {
  anthropicApiKey: string;
  repoRoot: string;
  diffOverview: string;
  diffEntries: FileDiffEntry[];
  tasks: AnalystTask[];
  conventionDocs: string;
}): Promise<ParallelAnalystResult> {
  const { anthropicApiKey, repoRoot, diffOverview, diffEntries, tasks, conventionDocs } =
    config;
  const startTime = Date.now();

  const activeTasks = tasks.slice(0, MAX_PARALLEL_ANALYSTS);

  if (activeTasks.length < tasks.length) {
    console.warn(
      `    ⚠️ Capped analysts from ${tasks.length} to ${MAX_PARALLEL_ANALYSTS}`
    );
  }

  const priorityOrder = { critical: 0, high: 1, medium: 2 };
  activeTasks.sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  );

  const client = new Anthropic({ apiKey: anthropicApiKey, maxRetries: 5 });

  console.log(
    `    🚀 Launching ${activeTasks.length} analysts (batched to prevent rate limits)...`
  );
  for (const task of activeTasks) {
    console.log(
      `       • [${task.id}] ${task.title} (${task.priority}, ~${task.max_tool_calls || DEFAULT_MAX_ITERATIONS} calls)`
    );
  }

  const results: PromiseSettledResult<SingleAnalystResult>[] = [];
  const BATCH_SIZE = 2;
  const BATCH_DELAY_MS = 5000; // 5 second delay between batches

  for (let i = 0; i < activeTasks.length; i += BATCH_SIZE) {
    const batch = activeTasks.slice(i, i + BATCH_SIZE);

    if (i > 0) {
      console.log(`    ⏳ Waiting ${BATCH_DELAY_MS / 1000}s before next batch to prevent rate limits...`);
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }

    const batchResults = await Promise.allSettled(
      batch.map((task) =>
        withTimeout(
          () =>
            runSingleAnalyst({
              client,
              repoRoot,
              diffOverview,
              diffEntries,
              task,
              conventionDocs,
            }),
          ANALYST_TIMEOUT_MS,
          `Analyst "${task.id}" timed out after ${ANALYST_TIMEOUT_MS / 1000}s`
        )
      )
    );

    results.push(...batchResults);
  }

  const analysts: SingleAnalystResult[] = [];
  const failedTasks: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const task = activeTasks[i];

    if (result.status === "fulfilled") {
      analysts.push(result.value);
      console.log(
        `    ✅ [${task.id}] ${task.title}: ${result.value.toolCalls} calls, ${result.value.durationMs}ms`
      );
      console.log(`\n--- [${task.id}] Raw Output Start ---`);
      console.log(result.value.summary);
      console.log(`--- [${task.id}] Raw Output End ---\n`);
    } else {
      failedTasks.push(task.id);
      console.warn(
        `    ❌ [${task.id}] ${task.title} failed: ${result.reason?.message || result.reason}`
      );
    }
  }

  const mergedContext = mergeAnalystSummaries(analysts, failedTasks);
  const totalToolCalls = analysts.reduce((sum, a) => sum + a.toolCalls, 0);

  return {
    analysts,
    mergedContext,
    totalToolCalls,
    totalDurationMs: Date.now() - startTime,
    failedTasks,
  };
}

// ---------------------------------------------------------------------------
// 7. MERGE SUMMARIES
// ---------------------------------------------------------------------------

function mergeAnalystSummaries(
  results: SingleAnalystResult[],
  failedTasks: string[]
): string {
  const sections: string[] = [];

  sections.push("# Codebase Analysis Report");
  sections.push(
    `_Generated by ${results.length} parallel analysts` +
    (failedTasks.length > 0
      ? ` (${failedTasks.length} failed: ${failedTasks.join(", ")})`
      : "") +
    "_\n"
  );

  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
  };
  const sorted = [...results].sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  );

  for (const result of sorted) {
    const confidence =
      result.earlyStop && result.stopReason !== "complete"
        ? ` ⚠️ (${result.stopReason} — findings may be incomplete)`
        : "";

    sections.push(`---`);
    sections.push(
      `## [${result.priority.toUpperCase()}] ${result.taskTitle}${confidence}`
    );
    sections.push(
      `_Analyst ${result.taskId}: ${result.toolCalls} tool calls, ${result.durationMs}ms_\n`
    );
    sections.push(result.summary);
    sections.push("");
  }

  if (failedTasks.length > 0) {
    sections.push(`---`);
    sections.push(`## ⚠️ Failed Investigations`);
    sections.push(
      `The following tasks failed: ${failedTasks.join(", ")}. ` +
      `The reviewer should manually check those areas.`
    );
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// 8. HELPERS
// ---------------------------------------------------------------------------

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function buildResult(
  task: AnalystTask,
  summary: string,
  iterations: number,
  toolCalls: number,
  earlyStop: boolean,
  stopReason: string,
  startTime: number
): SingleAnalystResult {
  return {
    taskId: task.id,
    taskTitle: task.title,
    concernType: task.concern_type,
    priority: task.priority,
    summary,
    iterations,
    toolCalls,
    earlyStop,
    stopReason,
    durationMs: Date.now() - startTime,
  };
}

async function forceAnalystSummary(
  client: Anthropic,
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  truncatedResponse: Anthropic.Message
): Promise<string> {
  const safeContent = truncatedResponse.content.filter(
    (b) => b.type !== "tool_use"
  );

  messages.push({
    role: "assistant",
    content:
      safeContent.length > 0
        ? (safeContent as any)
        : ([{ type: "text", text: "(response truncated)" }] as any),
  });

  messages.push({
    role: "user",
    content:
      "Your response was cut off. Write a concise final summary. No more tool calls.",
  });

  // Omit tools so the model CANNOT make tool calls — forces text-only response (via tool choice)
  const finalResponse = await client.messages.create({
    model: ANALYST_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: ALL_TOOL_DEFINITIONS as any,
    tool_choice: { type: "none" },
    messages,
  });

  const textOutput = extractText(finalResponse);
  return textOutput.trim() ? textOutput : "(Response contained only tool calls, no summary provided)";
}

function withTimeout<T>(
  promiseFn: () => Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);

    promiseFn()
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function truncateJSON(obj: Record<string, any>): string {
  const str = JSON.stringify(obj);
  return str.length > 100 ? str.slice(0, 100) + "…" : str;
}
