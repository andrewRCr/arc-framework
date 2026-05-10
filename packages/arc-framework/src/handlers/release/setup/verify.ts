/**
 * `arc release setup verify` command orchestrator.
 *
 * Reports the recorded release-wrapper setup posture without mutating state.
 * Default-prompt harnesses require direct prompt observation by the outer
 * agent harness, so this command prints the direct test command instead of
 * spawning it as an unobservable child process.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import { resolveAllSettings, type ResolvedSettingsResult } from "../../../lib/config/resolved-settings.js";
import { resolveIdentity } from "../../../lib/git/index.js";
import { gitExec } from "../../../lib/io-context.js";
import {
  readMarker,
  type HarnessEntry,
  type MarkerReadResult,
  type MarkerStorageError,
} from "../../../lib/release/setup-marker.js";
import { resolveArcRoot } from "../../../lib/paths.js";
import { ARC_PROJECT_ROOT_ERROR } from "../../shared.js";

export interface RunReleaseSetupVerifyOptions {
  /** Optional harness name to filter the marker report. */
  harness?: string;
  /** Resolved release-mode settings, including `arc.releaseEnabled`. */
  settings: ResolvedSettingsResult;
  /** Pre-read marker result for the current identity and repository root. */
  marker: MarkerReadResult;
  /** Sink for rendered output. Defaults to `process.stdout.write`. */
  writeStdout?: (msg: string) => void;
  /** Sink for errors. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
}

export interface RunReleaseSetupVerifyResult {
  exitCode: number;
}

/**
 * Run the setup verification report.
 *
 * @param opts - Settings, marker state, optional harness filter, and output sinks
 * @returns Exit code for the command invocation
 */
export function runReleaseSetupVerify(
  opts: RunReleaseSetupVerifyOptions,
): RunReleaseSetupVerifyResult {
  const writeStdout = opts.writeStdout ?? ((msg) => {
    process.stdout.write(msg);
  });
  const writeStderr = opts.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });

  if (!opts.marker.ok) {
    writeStderr(formatMarkerReadError(opts.marker.error));
    return { exitCode: 1 };
  }

  const releaseEnabled = opts.settings.resolved.releaseEnabled.value === "true";
  writeStdout(`release_setup: ${releaseEnabled ? "engaged" : "not engaged"}\n`);
  writeStdout(
    `release_enabled: ${String(releaseEnabled)} (${opts.settings.resolved.releaseEnabled.source})\n`,
  );
  writeStdout("behavioral_test_subprocess: not run\n");

  if (!releaseEnabled) return { exitCode: 0 };

  const selected = selectHarnesses(opts.marker.marker.harnesses, opts.harness);
  if (opts.harness !== undefined && selected.length === 0) {
    writeStdout(`harness: ${opts.harness}\n`);
    writeStdout("mode: not recorded\n");
    writeStdout("direct_prompt_observation: unavailable\n");
    writeStdout("reason: no release setup marker entry recorded for this harness\n");
    return { exitCode: 0 };
  }

  if (selected.length === 0) {
    writeStdout("harnesses: none recorded\n");
    return { exitCode: 0 };
  }

  writeStdout(`harnesses: ${selected.length} recorded\n`);
  for (const entry of selected) {
    renderHarness(entry, writeStdout);
  }

  return { exitCode: 0 };
}

/**
 * Commander adapter for `arc release setup verify`.
 *
 * @param opts - Commander-parsed harness filter option
 */
export async function handleReleaseSetupVerify(opts: { harness?: string }): Promise<void> {
  const cwd = resolveArcRoot(process.cwd());
  if (cwd === null) {
    process.stderr.write(`${ARC_PROJECT_ROOT_ERROR}\n`);
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentity({ exec: gitExec });
  const settings = await resolveAllSettings({
    cwd,
    exec: gitExec,
    readFile: (path) => readFile(path, "utf-8"),
    warn: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });
  const marker = await readMarker({ cwd, identity });

  const result = runReleaseSetupVerify({
    settings,
    marker,
    harness: opts.harness,
  });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

function selectHarnesses(entries: HarnessEntry[], harness: string | undefined): HarnessEntry[] {
  if (harness === undefined) return entries;
  return entries.filter((entry) => entry.name === harness);
}

function renderHarness(entry: HarnessEntry, writeStdout: (msg: string) => void): void {
  writeStdout(`harness: ${entry.name}\n`);
  writeStdout(`mode: ${entry.mode}\n`);
  writeStdout(`installed_at: ${entry.installedAt}\n`);

  if (entry.mode === "default-prompt") {
    writeStdout("direct_prompt_observation: required\n");
    writeStdout("test_command: arc release commit --version\n");
    writeStdout("expected: no harness prompt when the allowlist matches\n");
    return;
  }

  writeStdout("direct_prompt_observation: skipped\n");
  writeStdout("reason: bypass mode has no harness prompt to observe\n");
}

function formatMarkerReadError(error: MarkerStorageError): string {
  const path = error.path === undefined ? "" : ` (${error.path})`;
  return `Failed to read release setup marker${path}: ${error.message}\n`;
}
