/**
 * `arc release record-enabled` / `record-disabled` sub-command orchestrators.
 *
 * `record-enabled` writes `arc.release.enabled = true` to per-developer git
 * config (local scope) — idempotent on repeat. `record-disabled` clears the
 * same key — idempotent on absent. Both surface git-config failures via
 * the injectable `writeStderr` sink with a key-naming message and the
 * underlying git error.
 *
 * @module
 */

import {
  gitConfigGet,
  gitConfigSet,
  gitConfigUnset,
  type GitExec,
} from "../../lib/git/index.js";
import { gitExec } from "../../lib/io-context.js";

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
