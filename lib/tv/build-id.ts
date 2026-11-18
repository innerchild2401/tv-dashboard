/**
 * Deployment stamp for Cast soft-reload.
 * Prefer Vercel commit SHA so a new Production deploy changes /api/state.buildId
 * and the TV reloads without a Pi recast.
 */
export function resolveBuildId(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const commit = clean(env.VERCEL_GIT_COMMIT_SHA) || clean(env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA);
  if (commit) return commit.slice(0, 12);

  const deployment = clean(env.VERCEL_DEPLOYMENT_ID) || clean(env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID);
  if (deployment) return deployment.slice(0, 16);

  // Local / test fallback — stable per process, still differs from a Vercel deploy.
  return clean(env.TV_BUILD_ID) || "dev-local";
}

function clean(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "";
}
