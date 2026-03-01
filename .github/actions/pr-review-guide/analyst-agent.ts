// ============================================================================
// analyst-agent.ts — ReACT agent powered by Haiku 4.5
// Explores the repo based on the planner's investigation plan,
// then outputs a context summary for the reviewer.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS, executeTool } from "./repo-tools";

// ---------------------------------------------------------------------------
// 1. STRUCTURAL TYPES — avoids SDK namespace version issues
// ---------------------------------------------------------------------------

interface SDKTextBlock {
  type: "text";
  text: string;
}

function isTextBlock(b: { type: string }): b is SDKTextBlock {
  return b.type === "text";
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

// ---------------------------------------------------------------------------
// 2. CONFIGURATION
// ---------------------------------------------------------------------------

// Verify this model string against Anthropic's docs — it may change.
const ANALYST_MODEL = "claude-haiku-4-5-20251001";
const MAX_ITERATIONS = 20;
const MAX_TOOL_RESULT_CHARS = 12_000; // Truncate huge tool results
const MAX_TOTAL_TOOL_RESULT_CHARS = 80_000; // Stop if we've accumulated too much context

// ---------------------------------------------------------------------------
// 3. SYSTEM PROMPT
// ---------------------------------------------------------------------------

const ANALYST_SYSTEM_PROMPT = `You are a Code Analyst Agent. Your job is to explore a codebase and gather context that will help a senior reviewer understand a pull request.

You have been given:
1. A DIFF showing what changed in the PR.
2. An INVESTIGATION PLAN listing specific questions to answer.
3. CONVENTION FILES (like AGENTS.md, CLAUDE.md) if they exist in the repo — these are pre-loaded for you, no need to search for them.

YOUR WORKFLOW:
- Work through the investigation plan systematically.
- Use tools to find relevant code: search for symbols, read function bodies, check file structure.
- Be EFFICIENT: don't read entire files when a search + targeted get_lines will do.
- If a search returns too many results, REFINE your pattern — don't just read everything.
- Track what you've learned. Stop as soon as you have enough context to answer the plan's questions.

TOOL TIPS:
- search_in_file: Use specific identifiers (function names, class names, variable names). Avoid single common words like "return" or "const". If you get a "too many matches" message, use a more specific pattern.
- get_lines: Max 100 lines per call. Use it to read around a search hit, or read a known function. Make multiple calls for larger regions.
- list_files: Use to understand project structure. The pattern filter helps narrow results.
- get_file_info: Quick check if a file exists and how big it is before reading.

WHEN TO STOP:
- You have answered all questions in the investigation plan, OR
- You have found enough context that a reviewer would understand the changes, OR
- You've done ${MAX_ITERATIONS} tool calls (hard limit).

OUTPUT FORMAT:
When you have gathered enough information, respond with ONLY your summary text (no tool calls).
Structure your summary as:

## Repository Context
(Relevant conventions, patterns, architecture notes from AGENTS.md/CLAUDE.md or observed)

## Findings
For each investigation question:
### [Question]
(Your findings with specific file:line references)

## Key Context for Review
(The most important things the reviewer should know that aren't obvious from the diff alone)

## Risks & Concerns
(Anything you found that seems risky, inconsistent, or warrants extra scrutiny)

Be concise but specific. Always cite file paths and line numbers.`;

// ---------------------------------------------------------------------------
// 4. REACT LOOP
// ---------------------------------------------------------------------------

interface AnalystResult {
  summary: string;
  iterations: number;
  toolCalls: number;
  earlyStop: boolean;
  stopReason: string;
}

export async function runAnalystAgent(config: {
  anthropicApiKey: string;
  repoRoot: string;
  diff: string;
  investigationPlan: string;
  conventionDocs: string;
}): Promise<AnalystResult> {
  const { anthropicApiKey, repoRoot, diff, investigationPlan, conventionDocs } =
    config;

  const client = new Anthropic({ apiKey: anthropicApiKey });

  // Build the initial user message
  const userParts: string[] = [];

  if (conventionDocs) {
    userParts.push(
      `## Repository Conventions (pre-loaded)\n` +
        `These files were found in the repo and describe project standards. ` +
        `Use them to inform your analysis — no need to search for them.\n\n${conventionDocs}\n`
    );
  }

  userParts.push(`## PR Diff\n<diff>\n${diff}\n</diff>\n`);
  userParts.push(
    `## Investigation Plan\n${investigationPlan}\n\n` +
      `Work through these questions using the available tools. ` +
      `When you have enough context, write your final summary (with no tool calls).`
  );

  // Message history for the conversation
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userParts.join("\n") },
  ];

  let iterations = 0;
  let toolCallCount = 0;
  let totalToolResultChars = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    console.log(`    🔄 Analyst iteration ${iterations}...`);

    const response = await client.messages.create({
      model: ANALYST_MODEL,
      max_tokens: 4096,
      system: ANALYST_SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS as any,
      messages,
    });

    // --- Handle truncated response ---
    // If max_tokens was hit, the response may contain incomplete tool_use
    // blocks. Strip them (they have no matching tool_result) and force a summary.
    if (response.stop_reason === "max_tokens") {
      console.warn("    ⚠️ Analyst response truncated (max_tokens). Forcing summary.");

      const safeContent = response.content.filter(
        (b) => b.type !== "tool_use"
      );

      if (safeContent.length > 0) {
        messages.push({ role: "assistant", content: safeContent as any });
      } else {
        // Must still push an assistant turn to maintain alternating roles.
        messages.push({
          role: "assistant",
          content: [{ type: "text", text: "(response truncated)" }] as any,
        });
      }
      messages.push({
        role: "user",
        content:
          "Your previous response was cut off. Please write a concise final summary " +
          "based on everything you've learned so far. Do NOT make any more tool calls.",
      });

      const finalResponse = await client.messages.create({
        model: ANALYST_MODEL,
        max_tokens: 4096,
        system: ANALYST_SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS as any,
        messages,
      });

      return {
        summary: extractText(finalResponse),
        iterations,
        toolCalls: toolCallCount,
        earlyStop: true,
        stopReason: "max_tokens",
      };
    }

    // --- Check if the response is text-only (agent is done) ---
    const hasToolUse = response.content.some((b) => b.type === "tool_use");

    if (!hasToolUse) {
      return {
        summary: extractText(response),
        iterations,
        toolCalls: toolCallCount,
        earlyStop: false,
        stopReason: "complete",
      };
    }

    // --- Process tool calls ---
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent as any });

    const toolResults: ToolResultBlock[] = [];

    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;

      toolCallCount++;
      console.log(
        `    🔧 [${toolCallCount}] ${block.name}(${truncateJSON(block.input as Record<string, any>)})`
      );

      let result = await executeTool(
        repoRoot,
        block.name,
        block.input as Record<string, any>
      );

      // Truncate oversized results
      if (result.length > MAX_TOOL_RESULT_CHARS) {
        result =
          result.slice(0, MAX_TOOL_RESULT_CHARS) +
          `\n...[TRUNCATED — result was ${result.length} chars. Use more specific queries.]`;
      }

      totalToolResultChars += result.length;

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    // --- Check context budget ---
    // Merge the nudge into the SAME user message as the tool results
    // to avoid two consecutive user messages (API rejects that).
    if (totalToolResultChars > MAX_TOTAL_TOOL_RESULT_CHARS) {
      console.warn(
        `    ⚠️ Analyst hit context budget (${totalToolResultChars} chars). Forcing summary.`
      );

      messages.push({
        role: "user",
        content: [
          ...toolResults,
          {
            type: "text" as const,
            text:
              "You have gathered a large amount of context. Please write your final summary now " +
              "based on everything you've learned so far. Do NOT make any more tool calls.",
          },
        ],
      });

      const finalResponse = await client.messages.create({
        model: ANALYST_MODEL,
        max_tokens: 4096,
        system: ANALYST_SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS as any,
        messages,
      });

      return {
        summary: extractText(finalResponse),
        iterations,
        toolCalls: toolCallCount,
        earlyStop: true,
        stopReason: "context_budget",
      };
    }

    // --- Check max iterations ---
    // Same merge pattern: nudge goes into the same message as tool results.
    if (iterations >= MAX_ITERATIONS) {
      console.warn(
        `    ⚠️ Analyst hit max iterations (${MAX_ITERATIONS}). Forcing summary.`
      );

      messages.push({
        role: "user",
        content: [
          ...toolResults,
          {
            type: "text" as const,
            text:
              "You have reached the maximum number of tool calls. Please write your final summary now " +
              "based on everything you've learned so far. Do NOT make any more tool calls.",
          },
        ],
      });

      const finalResponse = await client.messages.create({
        model: ANALYST_MODEL,
        max_tokens: 4096,
        system: ANALYST_SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS as any,
        messages,
      });

      return {
        summary: extractText(finalResponse),
        iterations,
        toolCalls: toolCallCount,
        earlyStop: true,
        stopReason: "max_iterations",
      };
    }

    // --- Normal case: push tool results and continue ---
    messages.push({ role: "user", content: toolResults as any });
  }

  // Should not be reachable, but safety fallback
  return {
    summary: "Analyst completed without producing a summary.",
    iterations,
    toolCalls: toolCallCount,
    earlyStop: true,
    stopReason: "unexpected_exit",
  };
}

// ---------------------------------------------------------------------------
// 5. HELPERS
// ---------------------------------------------------------------------------

/** Extract text from a Messages API response */
function extractText(response: Anthropic.Message): string {
  return response.content
    .filter(isTextBlock)
    .map((b) => b.text)
    .join("");
}

/** Truncate a JSON object to a readable one-liner for logging */
function truncateJSON(obj: Record<string, any>): string {
  const str = JSON.stringify(obj);
  return str.length > 120 ? str.slice(0, 120) + "…" : str;
}
