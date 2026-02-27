// .github/actions/pr-review-guide/index.ts
// Thin entrypoint that reads env vars and calls the main logic.

import { run } from "./pr-review-guide"; // The main tool file

async function main() {
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const prNumber = parseInt(process.env.PR_NUMBER || "0", 10);
  const githubToken = process.env.GITHUB_TOKEN;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!owner || !repo || !prNumber || !githubToken || !anthropicApiKey) {
    console.error("Missing required environment variables:");
    console.error(
      "  REPO_OWNER, REPO_NAME, PR_NUMBER, GITHUB_TOKEN, ANTHROPIC_API_KEY"
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
    });

    // Log summary stats
    const criticalCount = guide.logical_changes.filter(
      (c) => c.importance === "critical"
    ).length;
    const highCount = guide.logical_changes.filter(
      (c) => c.importance === "high"
    ).length;

    if (criticalCount > 0) {
      console.log(`\n⚠️  ${criticalCount} CRITICAL changes need careful review.`);
    }
    if (highCount > 0) {
      console.log(`🟠 ${highCount} high-importance changes flagged.`);
    }
  } catch (err: any) {
    console.error(`❌ Failed: ${err.message}`);
    // Don't fail the workflow — review guide is advisory, not blocking
    process.exit(0);
  }
}

main();
