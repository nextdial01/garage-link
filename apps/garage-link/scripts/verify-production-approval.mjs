const target = process.env.VERCEL_ENV ?? process.env.VERCEL_TARGET_ENV ?? "";

if (target !== "production") {
  console.log("[kannagi-production-guard] Non-production build allowed.");
  process.exit(0);
}

const approvedSha = (process.env.KANNAGI_RELEASE_SHA ?? "").trim().toLowerCase();
const vercelGitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase();
const shaPattern = /^[0-9a-f]{40}$/;

if (!shaPattern.test(approvedSha)) {
  console.error("[kannagi-production-guard] BLOCKED: Production requires an explicitly approved 40-character KANNAGI_RELEASE_SHA.");
  process.exit(42);
}

if (vercelGitSha && vercelGitSha !== approvedSha) {
  console.error(`[kannagi-production-guard] BLOCKED: approved SHA ${approvedSha} does not match Vercel Git SHA ${vercelGitSha}.`);
  process.exit(42);
}

console.log(`[kannagi-production-guard] Production build approved for exact SHA ${approvedSha}.`);
