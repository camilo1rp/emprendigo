// .github/actions/pr-review-guide/index.ts
// Thin entrypoint that reads env vars and calls the multi-agent pipeline.

import { run } from "./pr-review-guide";

/** Sanitize error messages before posting publicly */
function sanitizeError(msg: string): string {
  let safe = msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
  safe = safe.replace(/sk-ant-[a-zA-Z0-9\-_]+/g, "[REDACTED]");
  safe = safe.replace(/sk-[a-zA-Z0-9\-_]{20,}/g, "[REDACTED]");
  safe = safe.replace(/ghp_[a-zA-Z0-9]+/g, "[REDACTED]");
  safe = safe.replace(/ghs_[a-zA-Z0-9]+/g, "[REDACTED]");
  return safe;
}

async function postFailureComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  errorMessage: string
) {
  try {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          body:
            `<!-- pr-review-guide-bot -->\n` +
            `⚠️ **PR Review Guide Bot** failed to generate a review guide.\n\n` +
            `**Error:** ${sanitizeError(errorMessage)}\n\n` +
            `_This is non-blocking. You can review the PR manually._`,
        }),
      }
    );
  } catch {
    console.error("Could not post failure comment to PR.");
  }
}

async function main() {
  const githubRepository = process.env.GITHUB_REPOSITORY;
  const prNumber = parseInt(process.env.PR_NUMBER || "0", 10);
  const githubToken = process.env.GITHUB_TOKEN;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!githubRepository || !prNumber || !githubToken || !anthropicApiKey) {
    console.error("Missing required environment variables:");
    console.error(
      "  GITHUB_REPOSITORY, PR_NUMBER, GITHUB_TOKEN, ANTHROPIC_API_KEY"
    );
    process.exit(1);
  }

  const [owner, repo] = githubRepository.split("/");
  if (!owner || !repo) {
    console.error(
      `Invalid GITHUB_REPOSITORY format: "${githubRepository}" (expected "owner/repo")`
    );
    process.exit(1);
  }

  // In CI, GITHUB_WORKSPACE points to the repo root (set by actions/checkout).
  // Locally, fall back to CWD (assumes you run from the repo root).
  const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();

  if (!repoRoot) {
    console.error(
      "Could not determine repo root. Set GITHUB_WORKSPACE or run from repo root."
    );
    process.exit(1);
  }

  try {
    const guide = await run({
      owner,
      repo,
      prNumber,
      githubToken,
      anthropicApiKey,
      repoRoot,
    });

    const criticalCount = guide.logical_changes.filter(
      (c) => c.importance === "critical"
    ).length;
    const highCount = guide.logical_changes.filter(
      (c) => c.importance === "high"
    ).length;

    if (criticalCount > 0) {
      console.log(
        `\n⚠️  ${criticalCount} CRITICAL changes need careful review.`
      );
    }
    if (highCount > 0) {
      console.log(`🟠 ${highCount} high-importance changes flagged.`);
    }
  } catch (err: any) {
    const msg = err.message || "Unknown error";
    console.error(`❌ Failed: ${msg}`);
    await postFailureComment(owner, repo, prNumber, githubToken, msg);
    // Exit 0 so we don't block CI — review guide is advisory
    process.exit(0);
  }
}

main();
