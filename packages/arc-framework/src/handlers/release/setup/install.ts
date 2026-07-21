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
import { z } from "zod";

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
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../../../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../../../lib/command-input/registry.js";

import { runReleaseOptIn, type RunReleaseOptResult } from "../record.js";

export type SetupInstallIdempotencyChoice =
  | "re-verify"
  | "update-markers"
  | "add-harness"
  | "exit";

/** Complete adapter-owned syntax for release setup installation. */
export const ReleaseSetupInstallInputSchema = z.object({
  harness: z.string().trim().min(1).optional(),
  mode: z.enum(["default-prompt", "bypass"]).optional(),
  idempotencyAction: z.enum(["exit", "re-verify", "update-markers", "add-harness"]).optional(),
  trustAccepted: z.boolean(),
  workflowVerified: z.boolean(),
  json: z.boolean(),
}).strict();

/** Fully validated release setup installation input. */
export type ReleaseSetupInstallInput = z.infer<typeof ReleaseSetupInstallInputSchema>;

/** Registry contribution owned by release setup install. */
export const releaseSetupInstallInputRegistration = {
  commandPath: "release setup install",
  schema: ReleaseSetupInstallInputSchema,
} satisfies CommandInputRegistration;

/** Commander syntax for the release setup install adapter. */
export interface ReleaseSetupInstallOptions {
  harness?: string;
  mode?: string;
  idempotencyAction?: string;
  yes?: boolean;
  workflowVerified?: boolean;
  json?: boolean;
}

export interface TrustAcknowledgmentOptions {
  harness: string;
  mode: HarnessMode;
  message: string;
}

export interface WorkflowVerificationOptions {
  harness: string;
  mode: HarnessMode;
  requiresPromptObservation: boolean;
}

export type UpsertHarnessEntry = (entry: HarnessEntry) => Promise<MarkerWriteResult>;

export type RecordOptIn = () => Promise<RunReleaseOptResult>;

export interface RunReleaseSetupInstallOptions {
  /** Complete adapter-resolved command input. */
  input: ReleaseSetupInstallInput;
  /** Resolved release-mode settings, including `arc.releaseOptedIn`. */
  settings: ResolvedSettingsResult;
  /** Pre-read marker result for the current identity and repository root. */
  marker: MarkerReadResult;
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

interface SetupInstallJsonEnvelope {
  schemaVersion: 1;
  command: "install";
  releaseOptedIn: {
    before: boolean;
    source: string;
    after: boolean;
  };
  harnesses: Array<{
    name: string;
    mode: HarnessMode;
    installedAt?: string;
    result: "existing" | "recorded";
  }>;
  idempotencyAction?: SetupInstallIdempotencyChoice | "cancelled";
  result: string;
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
  const humanStdout = opts.input.json ? writeStderr : writeStdout;

  if (!opts.marker.ok) {
    writeStderr(formatMarkerReadError(opts.marker.error));
    return finish(opts, null, writeStdout, 1);
  }

  const releaseOptedIn = opts.settings.resolved.releaseOptedIn.value === "true";
  const harnesses = opts.marker.marker.harnesses;
  const hasRecordedHarnesses = harnesses.length > 0;
  const report = buildJsonEnvelope({
    releaseOptedIn,
    releaseOptedInSource: opts.settings.resolved.releaseOptedIn.source,
    harnesses,
  });

  renderCurrentState({
    releaseOptedIn,
    releaseOptedInSource: opts.settings.resolved.releaseOptedIn.source,
    harnesses,
    writeStdout: humanStdout,
  });

  if (!releaseOptedIn && !hasRecordedHarnesses) {
    humanStdout("release_setup_install: fresh\n");
    return runSingleHarnessInstall(opts, { writeStdout: humanStdout, writeStderr }, report, writeStdout);
  }

  if (releaseOptedIn && hasRecordedHarnesses) {
    humanStdout("release_setup_install: existing\n");
    humanStdout("idempotency_prompt: required\n");

    const choice = opts.input.idempotencyAction ?? null;
    if (choice === null) {
      humanStdout("idempotency_action: cancelled\n");
      humanStdout("result: no-op acknowledged\n");
      report.idempotencyAction = "cancelled";
      report.result = "no-op acknowledged";
      return finish(opts, report, writeStdout, 0);
    }

    report.idempotencyAction = choice;
    renderIdempotencyChoice(choice, humanStdout);
    if (choice === "add-harness") {
      return runSingleHarnessInstall(opts, { writeStdout: humanStdout, writeStderr }, report, writeStdout);
    }
    report.result = choice;
    return finish(opts, report, writeStdout, 0);
  }

  humanStdout("release_setup_install: state-mismatch\n");
  report.result = "state-mismatch";
  return runSingleHarnessInstall(opts, { writeStdout: humanStdout, writeStderr }, report, writeStdout);
}

/**
 * Commander adapter for `arc release setup install`.
 *
 * @param opts - Commander-parsed install options
 */
export async function handleReleaseSetupInstall(
  opts: ReleaseSetupInstallOptions,
  suppliedContext?: InteractionContext,
): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false,
    machineReadable: opts.json === true,
    yes: opts.yes === true ? "authority" : "absent",
  });
  const parsedSyntax = ReleaseSetupInstallInputSchema.safeParse({
    ...(opts.harness === undefined ? {} : { harness: opts.harness }),
    ...(opts.mode === undefined ? {} : { mode: opts.mode }),
    ...(opts.idempotencyAction === undefined ? {} : { idempotencyAction: opts.idempotencyAction }),
    trustAccepted: context.confirmation === "accept",
    workflowVerified: opts.workflowVerified === true,
    json: opts.json === true,
  });
  if (!parsedSyntax.success) {
    process.stderr.write(`${parsedSyntax.error.issues.map((issue) =>
      `${issue.path.join(".")}: ${issue.message}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
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
  if (!marker.ok) {
    const result = await runReleaseSetupInstall({ settings, marker, input: parsedSyntax.data });
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
    return;
  }

  const releaseOptedIn = settings.resolved.releaseOptedIn.value === "true";
  const recorded = marker.marker.harnesses.length > 0;
  let idempotencyAction = parsedSyntax.data.idempotencyAction;
  if (releaseOptedIn && recorded && idempotencyAction === undefined) {
    idempotencyAction = context.interaction === "allowed"
      ? await promptForIdempotency() ?? "exit"
      : "exit";
  }
  const installsHarness = (!releaseOptedIn && !recorded)
    || releaseOptedIn !== recorded
    || idempotencyAction === "add-harness";

  let harness = parsedSyntax.data.harness;
  let mode = parsedSyntax.data.mode;
  if (installsHarness && context.interaction === "allowed") {
    harness ??= await promptForHarness();
    mode ??= await promptForMode();
  }
  if (installsHarness && context.interaction === "forbidden") {
    const missing = [
      ...(harness === undefined ? ["--harness <name>"] : []),
      ...(mode === undefined ? ["--mode <default-prompt|bypass>"] : []),
      ...(context.confirmation !== "accept" ? ["--yes"] : []),
      ...(opts.workflowVerified !== true ? ["--workflow-verified"] : []),
    ];
    if (missing.length > 0) {
      process.stderr.write(`error: missing required input: ${missing.join(", ")}\n`);
      process.exitCode = 1;
      return;
    }
  }

  let trustAccepted = context.confirmation === "accept";
  let workflowVerified = parsedSyntax.data.workflowVerified;
  if (installsHarness && context.interaction === "allowed" && harness !== undefined && mode !== undefined) {
    if (!trustAccepted) {
      trustAccepted = await promptForTrustAcknowledgment({
        harness,
        mode,
        message: buildTrustAcknowledgmentMessage(mode),
      }) === true;
    }
    if (!workflowVerified) {
      workflowVerified = await promptForWorkflowVerification({
        harness,
        mode,
        requiresPromptObservation: mode === "default-prompt",
      }) === true;
    }
  }
  const input = ReleaseSetupInstallInputSchema.parse({
    ...(harness === undefined ? {} : { harness }),
    ...(mode === undefined ? {} : { mode }),
    ...(idempotencyAction === undefined ? {} : { idempotencyAction }),
    trustAccepted,
    workflowVerified,
    json: parsedSyntax.data.json,
  });
  const result = await runReleaseSetupInstall({
    settings,
    marker,
    input,
    upsertHarness: (entry) => upsertHarness({ cwd, identity }, entry),
    recordOptIn: () => runReleaseOptIn({ exec: gitExec }),
  });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

async function promptForHarness(): Promise<string | undefined> {
  const value = await p.text({ message: "Harness name?" });
  return p.isCancel(value) || value.trim() === "" ? undefined : value.trim();
}

async function promptForMode(): Promise<HarnessMode | undefined> {
  const value = await p.select<HarnessMode>({
    message: "Harness mode?",
    options: [
      { value: "default-prompt", label: "Default prompt" },
      { value: "bypass", label: "Bypass" },
    ],
  });
  return p.isCancel(value) ? undefined : value;
}

function renderCurrentState(opts: {
  releaseOptedIn: boolean;
  releaseOptedInSource: string;
  harnesses: readonly HarnessEntry[];
  writeStdout: (msg: string) => void;
}): void {
  opts.writeStdout(`release_opted_in: ${String(opts.releaseOptedIn)} (${opts.releaseOptedInSource})\n`);
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
  report: SetupInstallJsonEnvelope,
  writeJsonStdout: (msg: string) => void,
): Promise<RunReleaseSetupInstallResult> {
  renderSingleHarnessNextAction(io.writeStdout);

  const input = validateSingleHarnessInput(opts, io.writeStderr);
  if (!input.ok) {
    report.result = "error";
    return finish(opts, report, writeJsonStdout, input.result.exitCode);
  }

  const markerUpsert = opts.upsertHarness;
  const recordOptIn = opts.recordOptIn;

  if (!opts.input.trustAccepted) {
    io.writeStdout("trust_acknowledgment: declined\n");
    io.writeStdout("result: aborted\n");
    report.result = "aborted";
    return finish(opts, report, writeJsonStdout, 0);
  }
  io.writeStdout("trust_acknowledgment: accepted\n");

  if (!opts.input.workflowVerified) {
    io.writeStdout("workflow_verification: not confirmed\n");
    io.writeStdout("result: aborted\n");
    report.result = "aborted";
    return finish(opts, report, writeJsonStdout, 0);
  }
  io.writeStdout("workflow_verification: confirmed\n");

  if (markerUpsert === undefined || recordOptIn === undefined) {
    io.writeStderr("Install state recording is unavailable.\n");
    report.result = "error";
    return finish(opts, report, writeJsonStdout, 1);
  }

  const markerResult = await markerUpsert({
    name: input.harness,
    mode: input.mode,
    installedAt: opts.now?.() ?? new Date().toISOString(),
  });
  if (!markerResult.ok) {
    io.writeStderr(formatMarkerReadError(markerResult.error));
    report.result = "error";
    return finish(opts, report, writeJsonStdout, 1);
  }
  io.writeStdout("marker: upserted\n");
  report.harnesses = markerResult.marker.harnesses.map((entry) => ({
    name: entry.name,
    mode: entry.mode,
    installedAt: entry.installedAt,
    result: entry.name === input.harness ? "recorded" : "existing",
  }));

  if (opts.settings.resolved.releaseOptedIn.value === "true") {
    io.writeStdout("opt_in: already recorded\n");
    report.releaseOptedIn.after = true;
  } else {
    const optInResult = await recordOptIn();
    if (optInResult.exitCode !== 0) {
      report.result = "error";
      return finish(opts, report, writeJsonStdout, optInResult.exitCode);
    }
    io.writeStdout("opt_in: recorded\n");
    report.releaseOptedIn.after = true;
  }

  io.writeStdout("result: install recorded\n");
  report.result = "install recorded";
  return finish(opts, report, writeJsonStdout, 0);
}

function validateSingleHarnessInput(
  opts: RunReleaseSetupInstallOptions,
  writeStderr: (msg: string) => void,
):
  | { ok: true; harness: string; mode: HarnessMode }
  | { ok: false; result: RunReleaseSetupInstallResult } {
  const harness = opts.input.harness?.trim();
  if (harness === undefined || harness === "") {
    writeStderr("error: missing required option --harness\n");
    return { ok: false, result: { exitCode: 1 } };
  }

  if (opts.input.mode === undefined) {
    writeStderr("error: missing required option --mode\n");
    return { ok: false, result: { exitCode: 1 } };
  }

  if (!isHarnessMode(opts.input.mode)) {
    writeStderr("error: invalid --mode; expected default-prompt or bypass\n");
    return { ok: false, result: { exitCode: 1 } };
  }

  return { ok: true, harness, mode: opts.input.mode };
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

function buildJsonEnvelope(opts: {
  releaseOptedIn: boolean;
  releaseOptedInSource: string;
  harnesses: readonly HarnessEntry[];
}): SetupInstallJsonEnvelope {
  return {
    schemaVersion: 1,
    command: "install",
    releaseOptedIn: {
      before: opts.releaseOptedIn,
      source: opts.releaseOptedInSource,
      after: opts.releaseOptedIn,
    },
    harnesses: opts.harnesses.map((entry) => ({
      name: entry.name,
      mode: entry.mode,
      installedAt: entry.installedAt,
      result: "existing",
    })),
    result: "not-run",
    exitCode: 0,
  };
}

function finish(
  opts: RunReleaseSetupInstallOptions,
  report: SetupInstallJsonEnvelope | null,
  writeStdout: (msg: string) => void,
  exitCode: number,
): RunReleaseSetupInstallResult {
  if (report !== null) {
    report.exitCode = exitCode;
    if (opts.input.json) {
      writeStdout(`${JSON.stringify(report, null, 2)}\n`);
    }
  }
  return { exitCode };
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
