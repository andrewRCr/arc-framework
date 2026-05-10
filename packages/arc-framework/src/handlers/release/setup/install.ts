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
import { gitExec } from "../../../lib/io-context.js";
import { resolveArcRoot } from "../../../lib/paths.js";
import {
  isHarnessMode,
  readMarker,
  upsertHarness,
  type HarnessMode,
  type HarnessEntry,
  type MarkerReadResult,
  type MarkerStorageError,
  type MarkerWriteResult,
} from "../../../lib/release/setup-marker.js";
import { ARC_PROJECT_ROOT_ERROR, isHandledError, resolveUserIdentity } from "../../shared.js";

import { runReleaseOptIn, type RunReleaseOptResult } from "../record.js";

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

export interface TrustAcknowledgmentOptions {
  harness: string;
  mode: HarnessMode;
  message: string;
}

export type TrustAcknowledgment = (
  opts: TrustAcknowledgmentOptions,
) => Promise<boolean | null>;

export interface WorkflowVerificationOptions {
  harness: string;
  mode: HarnessMode;
  requiresPromptObservation: boolean;
}

export type WorkflowVerification = (
  opts: WorkflowVerificationOptions,
) => Promise<boolean | null>;

export type UpsertHarnessEntry = (entry: HarnessEntry) => Promise<MarkerWriteResult>;

export type RecordOptIn = () => Promise<RunReleaseOptResult>;

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
  /** Mode-conditioned trust-model acknowledgment provider. */
  acknowledgeTrust?: TrustAcknowledgment;
  /** Workflow-mediated install/verify confirmation provider. */
  workflowVerification?: WorkflowVerification;
  /** Marker upsert operation, injected for tests. */
  upsertHarness?: UpsertHarnessEntry;
  /** Opt-in record operation, injected for tests. */
  recordOptIn?: RecordOptIn;
  /** Timestamp provider for marker entries. Defaults to current time. */
  now?: () => string;
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
    return runSingleHarnessInstall(opts, { writeStdout, writeStderr });
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
    if (choice === "add-harness") {
      return runSingleHarnessInstall(opts, { writeStdout, writeStderr });
    }
    return { exitCode: 0 };
  }

  writeStdout("release_setup_install: state-mismatch\n");
  return runSingleHarnessInstall(opts, { writeStdout, writeStderr });
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

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

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
    acknowledgeTrust: promptForTrustAcknowledgment,
    workflowVerification: promptForWorkflowVerification,
    upsertHarness: (entry) => upsertHarness({ cwd, identity }, entry),
    recordOptIn: () => runReleaseOptIn({ exec: gitExec }),
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

async function runSingleHarnessInstall(
  opts: RunReleaseSetupInstallOptions,
  io: {
    writeStdout: (msg: string) => void;
    writeStderr: (msg: string) => void;
  },
): Promise<RunReleaseSetupInstallResult> {
  renderSingleHarnessNextAction(io.writeStdout);

  const input = validateSingleHarnessInput(opts, io.writeStderr);
  if (!input.ok) return input.result;

  const acknowledgeTrust = opts.acknowledgeTrust ?? (() => Promise.resolve(null));
  const workflowVerification = opts.workflowVerification ?? (() => Promise.resolve(null));
  const markerUpsert = opts.upsertHarness;
  const recordOptIn = opts.recordOptIn;

  const trustAccepted = await acknowledgeTrust({
    harness: input.harness,
    mode: input.mode,
    message: buildTrustAcknowledgmentMessage(input.mode),
  });
  if (trustAccepted !== true) {
    io.writeStdout("trust_acknowledgment: declined\n");
    io.writeStdout("result: aborted\n");
    return { exitCode: 0 };
  }
  io.writeStdout("trust_acknowledgment: accepted\n");

  const workflowVerified = await workflowVerification({
    harness: input.harness,
    mode: input.mode,
    requiresPromptObservation: input.mode === "default-prompt",
  });
  if (workflowVerified !== true) {
    io.writeStdout("workflow_verification: not confirmed\n");
    io.writeStdout("result: aborted\n");
    return { exitCode: 0 };
  }
  io.writeStdout("workflow_verification: confirmed\n");

  if (markerUpsert === undefined || recordOptIn === undefined) {
    io.writeStderr("Install state recording is unavailable.\n");
    return { exitCode: 1 };
  }

  const markerResult = await markerUpsert({
    name: input.harness,
    mode: input.mode,
    installedAt: opts.now?.() ?? new Date().toISOString(),
  });
  if (!markerResult.ok) {
    io.writeStderr(formatMarkerReadError(markerResult.error));
    return { exitCode: 1 };
  }
  io.writeStdout("marker: upserted\n");

  const optInResult = await recordOptIn();
  if (optInResult.exitCode !== 0) {
    return optInResult;
  }
  io.writeStdout("opt_in: recorded\n");
  io.writeStdout("result: install recorded\n");
  return { exitCode: 0 };
}

function validateSingleHarnessInput(
  opts: RunReleaseSetupInstallOptions,
  writeStderr: (msg: string) => void,
):
  | { ok: true; harness: string; mode: HarnessMode }
  | { ok: false; result: RunReleaseSetupInstallResult } {
  const harness = opts.harness?.trim();
  if (harness === undefined || harness === "") {
    writeStderr("error: missing required option --harness\n");
    return { ok: false, result: { exitCode: 1 } };
  }

  if (opts.mode === undefined || opts.mode === "") {
    writeStderr("error: missing required option --mode\n");
    return { ok: false, result: { exitCode: 1 } };
  }

  if (!isHarnessMode(opts.mode)) {
    writeStderr("error: invalid --mode; expected default-prompt or bypass\n");
    return { ok: false, result: { exitCode: 1 } };
  }

  return { ok: true, harness, mode: opts.mode };
}

function buildTrustAcknowledgmentMessage(mode: HarnessMode): string {
  if (mode === "default-prompt") {
    return [
      "Installing the release-wrapper allowlist creates a trust shift.",
      "Matching arc release commit/push invocations rely on ARC interlock enforcement",
      "instead of the harness prompt. Other git commands are unchanged.",
      "Do you accept this trust shift?",
    ].join(" ");
  }

  return [
    "Bypass mode has no harness prompt to skip, so setup is audit-only.",
    "Opt-in records that the release wrapper's validation and audit layer is engaged",
    "above your existing safety posture. Do you accept this audit-only opt-in?",
  ].join(" ");
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

async function promptForTrustAcknowledgment(
  opts: TrustAcknowledgmentOptions,
): Promise<boolean | null> {
  const accepted = await p.confirm({
    message: `${opts.message}\n\nHarness: ${opts.harness}`,
    initialValue: false,
  });
  if (p.isCancel(accepted)) return null;
  return accepted;
}

async function promptForWorkflowVerification(
  opts: WorkflowVerificationOptions,
): Promise<boolean | null> {
  const prompt = opts.requiresPromptObservation
    ? `Confirm harness write and direct prompt observation passed for ${opts.harness}.`
    : `Confirm bypass-mode setup workflow completed for ${opts.harness}.`;
  const verified = await p.confirm({
    message: prompt,
    initialValue: false,
  });
  if (p.isCancel(verified)) return null;
  return verified;
}

function formatMarkerReadError(error: MarkerStorageError): string {
  const path = error.path === undefined ? "" : ` (${error.path})`;
  return `Failed to read release setup marker${path}: ${error.message}\n`;
}
