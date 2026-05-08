/**
 * Public surface for the `arc release` command namespace.
 *
 * Re-exports the orchestrator and Commander adapter so consumers (CLI
 * wiring in `src/cli.ts`, future programmatic users) import from a stable
 * path instead of reaching into `src/handlers/release/`.
 *
 * @module
 */

export { handleReleaseCommit } from "../handlers/release/commit-cli.js";
export type { HandleReleaseCommitOptions } from "../handlers/release/commit-cli.js";
export { runReleaseCommit } from "../handlers/release/commit.js";
export type {
  ReleaseCommitDeps,
  ReleaseCommitResult,
  SpawnGit,
  SpawnGitOptions,
  SpawnGitResult,
  AppendAudit,
} from "../handlers/release/commit.js";
