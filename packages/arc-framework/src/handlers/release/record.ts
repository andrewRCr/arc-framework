/**
 * `arc release opt-in` / `opt-out` / `status` sub-command orchestrators.
 *
 * `opt-in` writes `arc.releaseEnabled: true` to per-developer git config
 * (local scope) — idempotent on already-`true`. `opt-out` writes
 * `arc.releaseEnabled: false` to the same scope — idempotent on
 * already-`false`. Both follow the same pre-check shape: read existing,
 * skip if matching, otherwise set; failures surface via the injectable
 * `writeStderr` sink with the key name and the underlying git error.
 *
 * `opt-out` writes `false` rather than unsetting because the local-scope
 * key is the per-developer override of the project's yaml `release.enabled`.
 * Unsetting would fall back to yaml — meaning a developer in a project that
 * yaml-opted in could never personally override out. Writing `false`
 * explicitly makes the override symmetric.
 *
 * `status` renders the resolved opt-in flag and three interlock states with
 * provenance — human-readable lines or a `schemaVersion: 1` JSON envelope.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import {
  RELEASE_ENABLED_GIT_CONFIG_KEY,
  resolveAllSettings,
  type ResolvedSettingsResult,
} from "../../lib/config/resolved-settings.js";
import {
  gitConfigGet,
  gitConfigSet,
  type GitExec,
} from "../../lib/git/index.js";
import { gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { ARC_PROJECT_ROOT_ERROR } from "../shared.js";

export interface RunReleaseOptDeps {
  exec: GitExec;
  /** Sink for failure messages. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
}

export interface RunReleaseOptResult {
  exitCode: number;
}

/**
 * Run the `arc release opt-in` sub-command. Writes
 * `arc.releaseEnabled = true` to local git config when absent or set to a
 * non-`true` value; returns no-op success when already `true`. The pre-check
 * via `gitConfigGet` makes the operation idempotent without relying on
 * git's exit-code semantics, and lets a real `--local` set failure surface
 * via `writeStderr` with the key name and underlying git error before
 * exiting non-zero.
 */
export async function runReleaseOptIn(
  deps: RunReleaseOptDeps,
): Promise<RunReleaseOptResult> {
  const writeStderr = deps.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });
  let existing: string | undefined;
  try {
    existing = await gitConfigGet(deps.exec, RELEASE_ENABLED_GIT_CONFIG_KEY);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to read ${RELEASE_ENABLED_GIT_CONFIG_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
  if (existing === "true") return { exitCode: 0 };
  try {
    await gitConfigSet(deps.exec, RELEASE_ENABLED_GIT_CONFIG_KEY, "true", "local");
    return { exitCode: 0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to set ${RELEASE_ENABLED_GIT_CONFIG_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
}

/**
 * Commander adapter for `arc release opt-in`. Resolves the real `gitExec`
 * and delegates; surfaces non-zero orchestrator results via
 * `process.exitCode`.
 */
export async function handleReleaseOptIn(): Promise<void> {
  const result = await runReleaseOptIn({ exec: gitExec });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

/**
 * Run the `arc release opt-out` sub-command. Writes
 * `arc.releaseEnabled = false` to local git config when absent or set to a
 * non-`false` value; returns no-op success when already `false`. Mirrors
 * `runReleaseOptIn`'s pre-check shape so the two halves of the override
 * surface stay symmetric — a developer in a project with yaml
 * `release.enabled: true` can opt out locally without yaml's value
 * re-asserting.
 */
export async function runReleaseOptOut(
  deps: RunReleaseOptDeps,
): Promise<RunReleaseOptResult> {
  const writeStderr = deps.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });
  let existing: string | undefined;
  try {
    existing = await gitConfigGet(deps.exec, RELEASE_ENABLED_GIT_CONFIG_KEY);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to read ${RELEASE_ENABLED_GIT_CONFIG_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
  if (existing === "false") return { exitCode: 0 };
  try {
    await gitConfigSet(deps.exec, RELEASE_ENABLED_GIT_CONFIG_KEY, "false", "local");
    return { exitCode: 0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to set ${RELEASE_ENABLED_GIT_CONFIG_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
}

/**
 * Commander adapter for `arc release opt-out`. Resolves the real `gitExec`
 * and delegates; surfaces non-zero orchestrator results via
 * `process.exitCode`.
 */
export async function handleReleaseOptOut(): Promise<void> {
  const result = await runReleaseOptOut({ exec: gitExec });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

export interface RunReleaseStatusDeps {
  /** Pre-resolved release-mode settings — see `resolveAllSettings`. */
  settings: ResolvedSettingsResult;
  /** Emit the JSON envelope instead of human-readable lines. */
  json?: boolean;
  /** Sink for rendered output. Defaults to `process.stdout.write`. */
  writeStdout?: (msg: string) => void;
}

export interface RunReleaseStatusResult {
  exitCode: number;
}

/**
 * Run the `arc release status` sub-command. Renders the resolved opt-in flag
 * and three interlock states with provenance — human-readable lines by
 * default, or a `schemaVersion: 1` JSON envelope under `json: true`.
 *
 * `releaseEnabled` flows through the resolver as `"true"` / `"false"` and is
 * surfaced as a JSON / TypeScript boolean at the envelope boundary so
 * downstream consumers (status integration, CI parsers) get native types.
 */
export function runReleaseStatus(
  deps: RunReleaseStatusDeps,
): RunReleaseStatusResult {
  const writeStdout = deps.writeStdout ?? ((msg) => {
    process.stdout.write(msg);
  });
  const { resolved } = deps.settings;
  const releaseEnabledValue = resolved.releaseEnabled.value === "true";

  if (deps.json === true) {
    const envelope = {
      schemaVersion: 1,
      releaseEnabled: { value: releaseEnabledValue, source: resolved.releaseEnabled.source },
      commitInterlock: { value: resolved.commitInterlock.value, source: resolved.commitInterlock.source },
      pushInterlock: { value: resolved.pushInterlock.value, source: resolved.pushInterlock.source },
      syncInterlock: { value: resolved.syncInterlock.value, source: resolved.syncInterlock.source },
    };
    writeStdout(`${JSON.stringify(envelope, null, 2)}\n`);
    return { exitCode: 0 };
  }

  writeStdout(`release_enabled: ${String(releaseEnabledValue)} (${resolved.releaseEnabled.source})\n`);
  writeStdout(`commit_interlock: ${resolved.commitInterlock.value} (${resolved.commitInterlock.source})\n`);
  writeStdout(`push_interlock: ${resolved.pushInterlock.value} (${resolved.pushInterlock.source})\n`);
  writeStdout(`sync_interlock: ${resolved.syncInterlock.value} (${resolved.syncInterlock.source})\n`);
  return { exitCode: 0 };
}

/**
 * Commander adapter for `arc release status`. Resolves the real ARC root,
 * runs `resolveAllSettings`, and delegates to {@link runReleaseStatus}.
 * Resolver warnings stream to stderr so JSON-mode stdout stays pure.
 */
export async function handleReleaseStatus(opts: { json?: boolean }): Promise<void> {
  const cwd = resolveArcRoot(process.cwd());
  if (cwd === null) {
    process.stderr.write(`${ARC_PROJECT_ROOT_ERROR}\n`);
    process.exitCode = 1;
    return;
  }
  const settings = await resolveAllSettings({
    cwd,
    exec: gitExec,
    readFile: (path) => readFile(path, "utf-8"),
    warn: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });
  const result = runReleaseStatus({ settings, json: opts.json });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
