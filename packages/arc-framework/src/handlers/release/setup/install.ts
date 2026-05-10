/**
 * `arc release setup install` command orchestrator.
 *
 * Implements the state-read shell and existing-install idempotency branch.
 * Downstream install actions remain workflow-mediated: the CLI reports the
 * next branch to execute and never performs harness prompt observation as a
 * nested subprocess.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { resolveAllSettings, type ResolvedSettingsResult } from "../../../lib/config/resolved-settings.js";
import { resolveIdentity } from "../../../lib/git/index.js";
import { gitExec } from "../../../lib/io-context.js";
import { resolveArcRoot } from "../../../lib/paths.js";
import {
  readMarker,
  type HarnessEntry,
  type MarkerReadResult,
  type MarkerStorageError,
} from "../../../lib/release/setup-marker.js";
import { ARC_PROJECT_ROOT_ERROR } from "../../shared.js";

export type SetupInstallIdempotencyChoice =
  | "re-verify"
  | "update-markers"
  | "add-harness"
  | "exit";

export interface ChooseIdempotencyOptions {
  harnesses: readonly HarnessEntry[];
}

export type ChooseIdempotency = (
  opts: ChooseIdempotencyOptions,
) => Promise<SetupInstallIdempotencyChoice | null>;

export interface RunReleaseSetupInstallOptions {
  /** Optional harness name for downstream single-harness flow. */
  harness?: string;
  /** Optional mode for downstream single-harness flow. */
  mode?: string;
  /** Resolved release-mode settings, including `arc.releaseEnabled`. */
  settings: ResolvedSettingsResult;
  /** Pre-read marker result for the current identity and repository root. */
  marker: MarkerReadResult;
  /** Interactive idempotency-choice provider. */
  chooseIdempotency?: ChooseIdempotency;
  /** Sink for rendered output. Defaults to `process.stdout.write`. */
  writeStdout?: (msg: string) => void;
  /** Sink for errors. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
}

export interface RunReleaseSetupInstallResult {
  exitCode: number;
}

/**
 * Run the setup install state-read shell.
 *
 * @param opts - Settings, marker state, install options, prompt hook, and output sinks
 * @returns Exit code for the command invocation
 */
export async function runReleaseSetupInstall(
  opts: RunReleaseSetupInstallOptions,
): Promise<RunReleaseSetupInstallResult> {
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
  const harnesses = opts.marker.marker.harnesses;
  const hasRecordedHarnesses = harnesses.length > 0;

  renderCurrentState({
    releaseEnabled,
    releaseEnabledSource: opts.settings.resolved.releaseEnabled.source,
    harnesses,
    writeStdout,
  });

  if (!releaseEnabled && !hasRecordedHarnesses) {
    writeStdout("release_setup_install: fresh\n");
    renderSingleHarnessNextAction(writeStdout);
    return { exitCode: 0 };
  }

  if (releaseEnabled && hasRecordedHarnesses) {
    writeStdout("release_setup_install: existing\n");
    writeStdout("idempotency_prompt: required\n");

    const choice = await opts.chooseIdempotency?.({ harnesses }) ?? null;
    if (choice === null) {
      writeStdout("idempotency_action: cancelled\n");
      writeStdout("result: no-op acknowledged\n");
      return { exitCode: 0 };
    }

    renderIdempotencyChoice(choice, writeStdout);
    return { exitCode: 0 };
  }

  writeStdout("release_setup_install: state-mismatch\n");
  writeStdout("next_action: single-harness install flow\n");
  return { exitCode: 0 };
}

/**
 * Commander adapter for `arc release setup install`.
 *
 * @param opts - Commander-parsed install options
 */
export async function handleReleaseSetupInstall(opts: {
  harness?: string;
  mode?: string;
}): Promise<void> {
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

  const result = await runReleaseSetupInstall({
    settings,
    marker,
    harness: opts.harness,
    mode: opts.mode,
    chooseIdempotency: promptForIdempotency,
  });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

function renderCurrentState(opts: {
  releaseEnabled: boolean;
  releaseEnabledSource: string;
  harnesses: readonly HarnessEntry[];
  writeStdout: (msg: string) => void;
}): void {
  opts.writeStdout(`release_enabled: ${String(opts.releaseEnabled)} (${opts.releaseEnabledSource})\n`);
  if (opts.harnesses.length === 0) {
    opts.writeStdout("harnesses: none recorded\n");
    return;
  }

  opts.writeStdout(`harnesses: ${opts.harnesses.length} recorded\n`);
  for (const entry of opts.harnesses) {
    opts.writeStdout(`harness: ${entry.name}\n`);
    opts.writeStdout(`mode: ${entry.mode}\n`);
    opts.writeStdout(`installed_at: ${entry.installedAt}\n`);
  }
}

function renderSingleHarnessNextAction(writeStdout: (msg: string) => void): void {
  writeStdout("next_action: single-harness install flow\n");
}

function renderIdempotencyChoice(
  choice: SetupInstallIdempotencyChoice,
  writeStdout: (msg: string) => void,
): void {
  writeStdout(`idempotency_action: ${choice}\n`);

  if (choice === "exit") {
    writeStdout("result: no-op acknowledged\n");
    return;
  }

  if (choice === "re-verify") {
    writeStdout("next_action: workflow-mediated verify for recorded harnesses\n");
    writeStdout("direct_prompt_observation: outer-harness step\n");
    return;
  }

  if (choice === "update-markers") {
    writeStdout("next_action: workflow-mediated mode re-detection\n");
    return;
  }

  renderSingleHarnessNextAction(writeStdout);
  writeStdout("scope: harnesses not already recorded\n");
}

async function promptForIdempotency(): Promise<SetupInstallIdempotencyChoice | null> {
  const choice = await p.select<SetupInstallIdempotencyChoice>({
    message: "Release-wrapper setup is already recorded. What should install do?",
    options: [
      { value: "re-verify", label: "Re-verify" },
      { value: "update-markers", label: "Update markers" },
      { value: "add-harness", label: "Add harness" },
      { value: "exit", label: "Exit" },
    ],
  });
  if (p.isCancel(choice)) return null;
  return choice;
}

function formatMarkerReadError(error: MarkerStorageError): string {
  const path = error.path === undefined ? "" : ` (${error.path})`;
  return `Failed to read release setup marker${path}: ${error.message}\n`;
}
