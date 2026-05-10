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

export { handleReleasePush } from "../handlers/release/push-cli.js";
export type { HandleReleasePushOptions } from "../handlers/release/push-cli.js";
export { runReleasePush } from "../handlers/release/push.js";
export type {
  ReleasePushDeps,
  ReleasePushResult,
  RunPushability,
  SpawnPush,
  SpawnPushOptions,
  SpawnPushOutcome,
} from "../handlers/release/push.js";

export {
  handleReleaseOptIn,
  handleReleaseOptOut,
  handleReleaseStatus,
  runReleaseOptIn,
  runReleaseOptOut,
  runReleaseStatus,
} from "../handlers/release/record.js";
export {
  handleReleaseSetupPrintPatterns,
  runReleaseSetupPrintPatterns,
} from "../handlers/release/setup/print-patterns.js";
export {
  handleReleaseSetupVerify,
  runReleaseSetupVerify,
} from "../handlers/release/setup/verify.js";
export type {
  RunReleaseOptDeps,
  RunReleaseOptResult,
  RunReleaseStatusDeps,
  RunReleaseStatusResult,
} from "../handlers/release/record.js";
export type {
  RunReleaseSetupPrintPatternsOptions,
  RunReleaseSetupPrintPatternsResult,
} from "../handlers/release/setup/print-patterns.js";
export type {
  RunReleaseSetupVerifyOptions,
  RunReleaseSetupVerifyResult,
} from "../handlers/release/setup/verify.js";
