/** Source-pinned `ci-ok` check-run reduction for merge-readiness verdicts. */

import type { GitHubCheckRun, GitHubCheckRunApi } from "./check-runs.js";

/** Immutable GitHub App id that authors the repository's CI checks. */
export const GITHUB_ACTIONS_APP_ID = "15368";
const CI_OK_CONTEXT = "ci-ok";

function newest(runs: GitHubCheckRun[]): GitHubCheckRun | undefined {
  return [...runs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id - left.id)[0];
}

/** Resolve current `ci-ok` state, trusting only the pinned GitHub Actions App. */
export async function resolveCiState(
  checks: GitHubCheckRunApi,
  headSha: string,
): Promise<"pending" | "failure" | "success"> {
  const runs = await checks.list(headSha, GITHUB_ACTIONS_APP_ID, CI_OK_CONTEXT);
  const run = newest(runs.filter((item) =>
    item.name === CI_OK_CONTEXT && item.appId === GITHUB_ACTIONS_APP_ID));
  if (run === undefined || run.status !== "completed" || run.conclusion === null) return "pending";
  return run.conclusion === "success" ? "success" : "failure";
}
