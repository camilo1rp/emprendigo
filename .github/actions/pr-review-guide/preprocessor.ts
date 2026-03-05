import Anthropic from "@anthropic-ai/sdk";
import { FileDiffEntry } from "./diff-tools";

const PREPROCESSOR_MODEL = "claude-3-haiku-20240307";

export interface FileSummaryChunk {
    start_line: number;
    end_line: number;
    summary: string;
    type: string;
    function_calls: string[];
}

const PREPROCESSOR_PROMPT = `You are an expert code summarizer.
Your goal is to parse a massive git diff for a single file and compress it into structured semantic chunks so a Planner Agent can quickly understand what changed.

Return a JSON array of objects representing the logical changes.
Each object must match this schema:
{
  "start_line": number,    // Approximate starting line of the change block
  "end_line": number,      // Approximate ending line
  "summary": "string",     // A very concise summary of the change (e.g., "Added JWT token validation")
  "type": "string",        // e.g., "authentication", "trivial", "business_logic", "refactoring"
  "function_calls": ["func1", "func2"] // Any key functions called or modified in this block
}

DO NOT return anything except the raw JSON array. No markdown blocks, no explanations.`;

async function summarizeLargeFile(
    client: Anthropic,
    entry: FileDiffEntry
): Promise<FileSummaryChunk[]> {
    const diffTokens = Math.floor(entry.patch.length / 4);

    console.log(
        `    🤖 Summarizing large file: ${entry.filename} (${entry.additions + entry.deletions} lines, ~${diffTokens} tokens)...`
    );

    const MAX_PATCH_CHARS = 100_000;
    const safePatch = entry.patch.length > MAX_PATCH_CHARS
        ? entry.patch.slice(0, MAX_PATCH_CHARS) + "\n\n... [TRUNCATED DUE TO SIZE] ..."
        : entry.patch;

    const response = await client.messages.create({
        model: PREPROCESSOR_MODEL,
        max_tokens: 4096,
        system: PREPROCESSOR_PROMPT,
        messages: [
            {
                role: "user",
                content: `File: ${entry.filename}\n\nDiff:\n${safePatch}`,
            },
        ],
    });

    const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

    try {
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket === -1 || lastBracket === -1) {
            throw new Error("No JSON array bounds found in response");
        }

        const jsonStr = text.substring(firstBracket, lastBracket + 1);
        const parsed = JSON.parse(jsonStr) as any[];

        return parsed.map((item) => ({
            start_line: item?.start_line || 0,
            end_line: item?.end_line || 0,
            summary: item?.summary || "No summary provided",
            type: item?.type || "unknown",
            function_calls: Array.isArray(item?.function_calls) ? item.function_calls : [],
        }));
    } catch (err) {
        console.warn(`    ⚠️ Failed to parse LLM summary for ${entry.filename}: ${(err as Error).message}`);
        // Fallback to empty if it fails
        return [];
    }
}

export async function preprocessLargeDiff(
    diffEntries: FileDiffEntry[],
    anthropicApiKey: string
): Promise<string> {
    const client = new Anthropic({ apiKey: anthropicApiKey, maxRetries: 5 });

    const TOTAL_LINES_THRESHOLD = 500;
    const FILE_LINES_THRESHOLD = 200;

    const totalLinesChanged = diffEntries.reduce(
        (sum, e) => sum + e.additions + e.deletions,
        0
    );

    // If the total PR is small, just return the raw aggregated patches
    if (totalLinesChanged <= TOTAL_LINES_THRESHOLD) {
        return diffEntries.map((e) => e.patch).join("\n\n");
    }

    console.log(
        `  📈 Massive PR detected (${totalLinesChanged} lines). Preprocessing files > ${FILE_LINES_THRESHOLD} lines...`
    );

    const smallFiles: FileDiffEntry[] = [];
    const largeFiles: FileDiffEntry[] = [];

    for (const entry of diffEntries) {
        const linesChanged = entry.additions + entry.deletions;
        if (linesChanged > FILE_LINES_THRESHOLD) {
            largeFiles.push(entry);
        } else {
            smallFiles.push(entry);
        }
    }

    // Summarize the large files concurrently but in rate-limit-conscious batches
    const summarizedFiles: { filename: string; chunks: FileSummaryChunk[] }[] = [];
    const BATCH_SIZE = 3;
    const DELAY_MS = 2000;

    for (let i = 0; i < largeFiles.length; i += BATCH_SIZE) {
        const batch = largeFiles.slice(i, i + BATCH_SIZE);

        if (i > 0) {
            console.log(`    ⏳ Waiting ${DELAY_MS / 1000}s before next preprocessor batch to respect API limits...`);
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }

        const batchResults = await Promise.all(
            batch.map(async (entry) => {
                const chunks = await summarizeLargeFile(client, entry);
                return { filename: entry.filename, chunks };
            })
        );

        summarizedFiles.push(...batchResults);
    }

    // Assemble the clear, separated output document for the Planner
    const output: string[] = [];

    if (summarizedFiles.length > 0) {
        output.push(`## [Summarized Diffs] (Massive Files)`);
        output.push(`The following files were too large to include fully. They have been semantically summarized by an LLM:\n`);
        for (const f of summarizedFiles) {
            output.push(`### File: \`${f.filename}\``);
            if (f.chunks.length === 0) {
                output.push(`- *(LLM failed to summarize, treat as large refactoring)*\n`);
                continue;
            }
            for (const chunk of f.chunks) {
                const funcs = chunk.function_calls.length > 0 ? ` [Calls: ${chunk.function_calls.join(", ")}]` : "";
                output.push(`- **Lines ${chunk.start_line}-${chunk.end_line}** (${chunk.type}): ${chunk.summary}${funcs}`);
            }
            output.push("");
        }
        output.push("---\n");
    }

    if (smallFiles.length > 0) {
        output.push(`## [Complete Diffs] (Small Files)`);
        output.push(`The following files were small enough to include their raw diff patches:\n`);
        for (const entry of smallFiles) {
            output.push(entry.patch);
        }
    }

    return output.join("\n");
}
