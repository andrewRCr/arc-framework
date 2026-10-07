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

import { readFile } from "node:fs/promises";
import { z } from "zod";

import { resolveAllSettings, type ResolvedSettingsResult } from "../../../lib/config/resolved-settings.js";
import { createGitExec } from "../../../lib/io-context.js";
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
import type { InteractionContext } from "../../../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../../../lib/command-input/registry.js";
import { declarePromptSite, type CommandInputDeclaration } from "../../../lib/command-input/declaration.js";
import { prompt, type PromptOutcome } from "../../../lib/command-input/prompter.js";
import type { InputRequirement, InputResolution } from "../../../lib/command-input/resolution.js";

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

export interface InteractiveInstallInputs {
  readonly harness: string;
  readonly mode: HarnessMode;
  readonly trustAccepted: true;
  readonly workflowVerified: true;
}

export interface InteractiveInstallPrompts {
  readonly harness: () => Promise<InputResolution<string>>;
  readonly mode: () => Promise<InputResolution<HarnessMode>>;
  readonly trust: (opts: TrustAcknowledgmentOptions) => Promise<InputResolution<boolean>>;
  readonly workflow: (opts: WorkflowVerificationOptions) => Promise<InputResolution<boolean>>;
}

/** Registry contribution owned by release setup install. */
export const releaseSetupInstallInputRegistration = {
  commandPath: "release setup install",
  schema: ReleaseSetupInstallInputSchema,
  schemaFields: {
    "option.harness": "harness",
    "option.mode": "mode",
    "option.idempotency-action": "idempotencyAction",
    "option.yes": "trustAccepted",
    "option.workflow-verified": "workflowVerified",
    "option.json": "json",
  },
} satisfies CommandInputRegistration;

/** Declared acquisition for release setup harness. */
export const releaseHarnessPromptSite = declarePromptSite("prompt.release-install.harness", "text",
  { file: "handlers/release/setup/install.ts", symbol: "releaseHarnessPromptSite" }, {
    acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["--harness <name>"] },
    mutationBoundary: "release setup install handler", subprocess: "none",
  });

/** Declared acquisition for release setup mode. */
export const releaseModePromptSite = declarePromptSite("prompt.release-install.mode", "select",
  { file: "handlers/release/setup/install.ts", symbol: "releaseModePromptSite" }, {
    acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["--mode <mode>"] },
    mutationBoundary: "release setup install handler", subprocess: "none",
  });

/** Declared acquisition for release setup idempotency. */
export const releaseIdempotencyPromptSite = declarePromptSite("prompt.release-install.idempotency", "select",
  { file: "handlers/release/setup/install.ts", symbol: "releaseIdempotencyPromptSite" }, {
    acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["--idempotency-action <action>"] },
    mutationBoundary: "release setup install handler", subprocess: "none",
  });

/** Declared acquisition for release setup trust. */
export const releaseTrustPromptSite = declarePromptSite("prompt.release-install.trust", "confirm",
  { file: "handlers/release/setup/install.ts", symbol: "releaseTrustPromptSite" }, {
    acquisition: "protected-confirmation", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-authority", flags: ["--yes"], acceptedSyntax: ["--yes"] },
    mutationBoundary: "release setup installation", subprocess: "none",
  });

/** Declared acquisition for release setup workflow. */
export const releaseWorkflowPromptSite = declarePromptSite("prompt.release-install.workflow", "confirm",
  { file: "handlers/release/setup/install.ts", symbol: "releaseWorkflowPromptSite" }, {
    acquisition: "required-evidence", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: ["--workflow-verified"], acceptedSyntax: ["--workflow-verified"] },
    mutationBoundary: "release workflow verification", subprocess: "none",
  });

/** Input and interaction policies owned by release setup installation. */
export const releaseSetupInstallInputPolicyDeclarations = [{
  commandPath: "release setup install",
  aliases: [],
  sites: [
    {
      id: "option.yes", source: { file: "cli.ts", symbol: "program" }, origin: "syntax",
      acquisition: "protected-confirmation", schemaOwnership: "owned", schemaField: "trustAccepted",
      cancellation: "not-applicable",
      automation: { noInput: "require-authority", flags: ["--yes"], acceptedSyntax: [] },
      mutationBoundary: "release setup install handler", subprocess: "none",
    },
    {
      id: "option.json", source: { file: "cli.ts", symbol: "program" }, origin: "syntax",
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
      cancellation: "not-applicable", automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    },
    releaseHarnessPromptSite,
    releaseModePromptSite,
    releaseIdempotencyPromptSite,
    releaseTrustPromptSite,
    releaseWorkflowPromptSite,
  ],
}] satisfies readonly CommandInputDeclaration[];

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
  context: InteractionContext,
): Promise<void> {
  const exec = createGitExec(context.subprocess);
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
    identity = await resolveUserIdentity(exec);
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const settings = await resolveAllSettings({
    cwd,
    exec,
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
  if (releaseOptedIn && recorded) {
    const acquired = await promptForIdempotency(context, idempotencyAction);
    if (acquired.kind === "unavailable") {
      reportUnavailableInstallInput(acquired);
      return;
    }
    idempotencyAction = acquired.kind === "resolved" ? acquired.value : "exit";
  }
  const installsHarness = (!releaseOptedIn && !recorded)
    || releaseOptedIn !== recorded
    || idempotencyAction === "add-harness";

  let harness = parsedSyntax.data.harness;
  let mode = parsedSyntax.data.mode;
  let trustAccepted = parsedSyntax.data.trustAccepted;
  let workflowVerified = parsedSyntax.data.workflowVerified;
  if (installsHarness) {
    const acquired = await acquireInteractiveInstallInputs({
      context, harness, mode, trustAccepted, workflowVerified,
    });
    if (acquired.kind === "unavailable") {
      reportUnavailableInstallInput(acquired);
      return;
    }
    if (acquired.kind !== "resolved") return;
    ({ harness, mode, trustAccepted, workflowVerified } = acquired.value);
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
    recordOptIn: () => runReleaseOptIn({ exec }),
  });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

/**
 * Acquire release installation values without continuing past cancellation or declined evidence.
 * @param input - Invocation context and already supplied values/evidence
 * @param prompts - Injectable acquisition boundary
 * @returns Complete authoritative input, all unavailable requirements, or cancellation
 */
export async function acquireInteractiveInstallInputs(
  input: {
    readonly context: InteractionContext;
    readonly harness?: string;
    readonly mode?: HarnessMode;
    readonly trustAccepted: boolean;
    readonly workflowVerified: boolean;
  },
  prompts: InteractiveInstallPrompts = {
    harness: () => promptForHarness(input.context, input.harness),
    mode: () => promptForMode(input.context, input.mode),
    trust: (opts) => promptForTrustAcknowledgment(input.context, opts, input.trustAccepted ? true : undefined),
    workflow: (opts) => promptForWorkflowVerification(input.context, opts, input.workflowVerified ? true : undefined),
  },
): Promise<InputResolution<InteractiveInstallInputs>> {
  const missing: InputRequirement[] = [];
  const harness = await prompts.harness();
  if (installAcquisitionStopped(harness, missing)) return { kind: "cancelled" };
  const mode = await prompts.mode();
  if (installAcquisitionStopped(mode, missing)) return { kind: "cancelled" };

  const evidence = {
    harness: harness.kind === "resolved" ? harness.value : "",
    mode: mode.kind === "resolved" ? mode.value : "default-prompt" as const,
  };
  const trust = await prompts.trust({ ...evidence, message: buildTrustAcknowledgmentMessage(evidence.mode) });
  if (installAcquisitionStopped(trust, missing)) return { kind: "cancelled" };
  const workflow = await prompts.workflow({ ...evidence, requiresPromptObservation: evidence.mode === "default-prompt" });
  if (installAcquisitionStopped(workflow, missing)) return { kind: "cancelled" };

  if (missing.length > 0) return { kind: "unavailable", missing };
  if (harness.kind !== "resolved" || mode.kind !== "resolved") return { kind: "cancelled" };
  return { kind: "resolved", value: { harness: harness.value, mode: mode.value,
    trustAccepted: true, workflowVerified: true }, source: "derived" };
}

/** Collect a refused question while stopping on cancellation or declined evidence. */
function installAcquisitionStopped<Value>(acquired: InputResolution<Value>, missing: InputRequirement[]): boolean {
  if (acquired.kind === "unavailable") {
    missing.push(...acquired.missing);
    return false;
  }
  return acquired.kind !== "resolved" || acquired.value === false;
}

function reportUnavailableInstallInput(input: Extract<InputResolution<unknown>, { kind: "unavailable" }>): void {
  process.stderr.write(`error: missing required input: ${input.missing.flatMap((item) => item.acceptedSyntax).join(", ")}\n`);
  process.exitCode = 1;
}

function installPromptAcquisition<Value>(answer: PromptOutcome<Value>, name: string): InputResolution<Value> {
  if (answer.kind === "refused") return { kind: "unavailable", missing: [{ name, acceptedSyntax: answer.acceptedSyntax }] };
  if (answer.kind === "cancelled") return answer;
  return { kind: "resolved", value: answer.value, source: "prompt" };
}

async function promptForHarness(context: InteractionContext, supplied?: string): Promise<InputResolution<string>> {
  const acquired = installPromptAcquisition(await prompt(releaseHarnessPromptSite, context,
    { message: "Harness name?", explicitAnswer: supplied }), "harness");
  if (acquired.kind !== "resolved") return acquired;
  return acquired.value.trim() === "" ? { kind: "cancelled" } : { ...acquired, value: acquired.value.trim() };
}

async function promptForMode(context: InteractionContext, supplied?: HarnessMode): Promise<InputResolution<HarnessMode>> {
  return installPromptAcquisition(await prompt<HarnessMode>(releaseModePromptSite, context, {
    message: "Harness mode?", explicitAnswer: supplied,
    options: [
      { value: "default-prompt", label: "Default prompt" },
      { value: "bypass", label: "Bypass" },
    ],
  }), "mode");
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

async function promptForIdempotency(context: InteractionContext,
  supplied?: SetupInstallIdempotencyChoice): Promise<InputResolution<SetupInstallIdempotencyChoice>> {
  return installPromptAcquisition(await prompt<SetupInstallIdempotencyChoice>(releaseIdempotencyPromptSite, context, {
    message: "Release-wrapper setup is already recorded. What should install do?", explicitAnswer: supplied,
    options: [
      { value: "re-verify", label: "Re-verify" },
      { value: "update-markers", label: "Update markers" },
      { value: "add-harness", label: "Add harness" },
      { value: "exit", label: "Exit" },
    ],
  }), "idempotency action");
}

async function promptForTrustAcknowledgment(context: InteractionContext,
  opts: TrustAcknowledgmentOptions, supplied?: boolean): Promise<InputResolution<boolean>> {
  return installPromptAcquisition(await prompt(releaseTrustPromptSite, context, {
    message: `${opts.message}\n\nHarness: ${opts.harness}`, initialValue: false, explicitAnswer: supplied,
  }), "trust");
}

async function promptForWorkflowVerification(context: InteractionContext,
  opts: WorkflowVerificationOptions, supplied?: boolean): Promise<InputResolution<boolean>> {
  const message = opts.requiresPromptObservation
    ? `Confirm harness write and direct prompt observation passed for ${opts.harness}.`
    : `Confirm bypass-mode setup workflow completed for ${opts.harness}.`;
  return installPromptAcquisition(await prompt(releaseWorkflowPromptSite, context, {
    message, initialValue: false, explicitAnswer: supplied,
  }), "workflow");
}

function formatMarkerReadError(error: MarkerStorageError): string {
  const path = error.path === undefined ? "" : ` (${error.path})`;
  return `Failed to read release setup marker${path}: ${error.message}\n`;
}
