/**
 * `arc release record-enabled` / `record-disabled` / `status` sub-command
 * orchestrators.
 *
 * `record-enabled` writes `arc.release.enabled = true` to per-developer git
 * config (local scope) — idempotent on repeat. `record-disabled` clears the
 * same key — idempotent on absent. Both surface git-config failures via
 * the injectable `writeStderr` sink with a key-naming message and the
 * underlying git error. `status` renders the resolved opt-in flag and three
 * interlock states with provenance — human-readable lines or a
 * `schemaVersion: 1` JSON envelope.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import { resolveAllSettings, type ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";
import {
  gitConfigGet,
  gitConfigSet,
  gitConfigUnset,
  type GitExec,
} from "../../lib/git/index.js";
import { gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { ARC_PROJECT_ROOT_ERROR } from "../shared.js";

const RELEASE_ENABLED_KEY = "arc.release.enabled";

export interface RunReleaseRecordDeps {
  exec: GitExec;
  /** Sink for failure messages. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
}

export interface RunReleaseRecordResult {
  exitCode: number;
}

/**
 * Run the `arc release record-enabled` sub-command. Writes
 * `arc.release.enabled = true` to local git config when absent or set to a
 * non-`true` value; returns no-op success when already `true`. The pre-check
 * via `gitConfigGet` makes the operation idempotent without relying on
 * git's exit-code semantics, and lets a real `--local` set failure surface
 * via `writeStderr` with the key name and underlying git error before
 * exiting non-zero.
 */
export async function runReleaseRecordEnabled(
  deps: RunReleaseRecordDeps,
): Promise<RunReleaseRecordResult> {
  const writeStderr = deps.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });
  const existing = await gitConfigGet(deps.exec, RELEASE_ENABLED_KEY);
  if (existing === "true") return { exitCode: 0 };
  try {
    await gitConfigSet(deps.exec, RELEASE_ENABLED_KEY, "true", "local");
    return { exitCode: 0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to set ${RELEASE_ENABLED_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
}

/**
 * Commander adapter for `arc release record-enabled`. Resolves the real
 * `gitExec` and delegates; surfaces non-zero orchestrator results via
 * `process.exitCode`.
 */
export async function handleReleaseRecordEnabled(): Promise<void> {
  const result = await runReleaseRecordEnabled({ exec: gitExec });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

/**
 * Run the `arc release record-disabled` sub-command. Clears
 * `arc.release.enabled` from git config when present; returns no-op success
 * when the key is absent (idempotent on repeat, and silent when wrappers
 * were never enabled). `gitConfigUnset` performs its own check-then-unset
 * via `gitConfigGet`, so only real `--unset` failures propagate — those
 * are surfaced via `writeStderr` with the key name and underlying git error
 * before exiting non-zero.
 */
export async function runReleaseRecordDisabled(
  deps: RunReleaseRecordDeps,
): Promise<RunReleaseRecordResult> {
  const writeStderr = deps.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });
  try {
    await gitConfigUnset(deps.exec, RELEASE_ENABLED_KEY);
    return { exitCode: 0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to unset ${RELEASE_ENABLED_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
}

/**
 * Commander adapter for `arc release record-disabled`. Resolves the real
 * `gitExec` and delegates; surfaces non-zero orchestrator results via
 * `process.exitCode`.
 */
export async function handleReleaseRecordDisabled(): Promise<void> {
  const result = await runReleaseRecordDisabled({ exec: gitExec });
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
