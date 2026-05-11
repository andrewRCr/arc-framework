/**
 * `arc release setup uninstall` command orchestrator.
 *
 * Implements the workflow-mediated rollback shell: the resident agent removes
 * harness-side allowlist entries, then the CLI removes ARC marker state and
 * records opt-out when the final harness entry disappears.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { resolveAllSettings, type ResolvedSettingsResult } from "../../../lib/config/resolved-settings.js";
import { gitExec } from "../../../lib/io-context.js";
import { resolveArcRoot } from "../../../lib/paths.js";
import {
  readMarker,
  removeHarness,
  type HarnessEntry,
  type HarnessMode,
  type MarkerReadResult,
  type MarkerStorageError,
  type MarkerWriteResult,
} from "../../../lib/release/setup-marker.js";
import { ARC_PROJECT_ROOT_ERROR, isHandledError, resolveUserIdentity } from "../../shared.js";

import { runReleaseOptOut, type RunReleaseOptResult } from "../record.js";
import { runReleaseSetupPrintPatterns } from "./print-patterns.js";

export interface CleanupVerificationOptions {
  harness: string;
  mode: HarnessMode;
  installedAt: string;
  patterns: readonly string[];
}

export type CleanupVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

export type CleanupVerification = (
  opts: CleanupVerificationOptions,
) => Promise<CleanupVerificationResult | null>;

export type ReadMarker = () => Promise<MarkerReadResult>;

export type RemoveHarnessEntry = (name: string) => Promise<MarkerWriteResult>;

export type RecordOptOut = () => Promise<RunReleaseOptResult>;

export type ResolveCanonicalPatterns = (harness: string) => string[];

export interface RunReleaseSetupUninstallOptions {
  /** Required harness name for single-harness uninstall flow. */
  harness?: string;
  /** Emit a schemaVersion 1 JSON envelope on stdout. */
  json?: boolean;
  /** Resolved release-mode settings, including `arc.releaseOptedIn`. */
  settings: ResolvedSettingsResult;
  /** Marker read operation, delayed until after required option validation. */
  readMarker: ReadMarker;
  /** Workflow-mediated cleanup confirmation provider. */
  cleanup?: CleanupVerification;
  /** Marker removal operation, injected for tests. */
  removeHarness?: RemoveHarnessEntry;
  /** Opt-out record operation, injected for tests. */
  recordOptOut?: RecordOptOut;
  /** Canonical raw pattern source, injected for tests. */
  resolvePatterns?: ResolveCanonicalPatterns;
  /** Sink for rendered output. Defaults to `process.stdout.write`. */
  writeStdout?: (msg: string) => void;
  /** Sink for errors. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
}

export interface RunReleaseSetupUninstallResult {
  exitCode: number;
}

interface SetupUninstallJsonEnvelope {
  schemaVersion: 1;
  command: "uninstall";
  releaseOptedIn: {
    before: boolean;
    source: string;
    after: boolean;
  };
  harnesses: Array<{
    name: string;
    mode?: HarnessMode;
    installedAt?: string;
    result: "existing" | "removed" | "not-recorded";
  }>;
  cleanupAction?: "confirmed" | "refused" | "cancelled" | "not-needed";
  cleanupMessage?: string;
  result: string;
  exitCode: number;
}

/**
 * Run the setup uninstall state-read shell.
 *
 * @param opts - Settings, delayed marker read, uninstall options, prompt hook, and output sinks
 * @returns Exit code for the command invocation
 */
export async function runReleaseSetupUninstall(
  opts: RunReleaseSetupUninstallOptions,
): Promise<RunReleaseSetupUninstallResult> {
  const writeStdout = opts.writeStdout ?? ((msg) => {
    process.stdout.write(msg);
  });
  const writeStderr = opts.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });
  const humanStdout = opts.json === true ? writeStderr : writeStdout;

  const harness = opts.harness?.trim();
  if (harness === undefined || harness === "") {
    writeStderr("error: missing required option --harness\n");
    return { exitCode: 1 };
  }

  const marker = await opts.readMarker();
  if (!marker.ok) {
    writeStderr(formatMarkerStorageError(marker.error));
    return finish(opts, null, writeStdout, 1);
  }

  const releaseOptedIn = opts.settings.resolved.releaseOptedIn.value === "true";
  const report = buildJsonEnvelope({
    harness,
    releaseOptedIn,
    releaseOptedInSource: opts.settings.resolved.releaseOptedIn.source,
    harnesses: marker.marker.harnesses,
  });

  renderCurrentState({
    releaseOptedIn,
    releaseOptedInSource: opts.settings.resolved.releaseOptedIn.source,
    harnesses: marker.marker.harnesses,
    writeStdout: humanStdout,
  });

  const entry = marker.marker.harnesses.find((candidate) => candidate.name === harness);
  if (entry === undefined) {
    humanStdout("release_setup_uninstall: already-uninstalled\n");
    humanStdout("result: no-op acknowledged\n");
    report.cleanupAction = "not-needed";
    report.result = "no-op acknowledged";
    return finish(opts, report, writeStdout, 0);
  }

  humanStdout("release_setup_uninstall: recorded\n");
  const patterns = (opts.resolvePatterns ?? resolveCanonicalPatterns)(harness);
  renderPatterns(patterns, humanStdout);

  const cleanup = opts.cleanup ?? (() => Promise.resolve(null));
  const cleanupResult = await cleanup({
    harness,
    mode: entry.mode,
    installedAt: entry.installedAt,
    patterns,
  });

  if (cleanupResult === null) {
    humanStdout("cleanup_verification: cancelled\n");
    humanStdout("result: aborted\n");
    report.cleanupAction = "cancelled";
    report.result = "aborted";
    return finish(opts, report, writeStdout, 0);
  }

  if (!cleanupResult.ok) {
    humanStdout(`cleanup_refusal: ${cleanupResult.reason}\n`);
    humanStdout("result: cleanup refused\n");
    report.cleanupAction = "refused";
    report.cleanupMessage = cleanupResult.reason;
    report.result = "cleanup refused";
    return finish(opts, report, writeStdout, 1);
  }

  humanStdout("cleanup_verification: confirmed\n");
  report.cleanupAction = "confirmed";

  if (opts.removeHarness === undefined) {
    writeStderr("Uninstall state recording is unavailable.\n");
    report.result = "error";
    return finish(opts, report, writeStdout, 1);
  }

  const markerResult = await opts.removeHarness(harness);
  if (!markerResult.ok) {
    writeStderr(formatMarkerStorageError(markerResult.error));
    report.result = "error";
    return finish(opts, report, writeStdout, 1);
  }

  humanStdout("marker: removed\n");
  report.harnesses = marker.marker.harnesses.map((candidate) => ({
    name: candidate.name,
    mode: candidate.mode,
    installedAt: candidate.installedAt,
    result: candidate.name === harness ? "removed" : "existing",
  }));

  if (markerResult.marker.harnesses.length > 0) {
    humanStdout("opt_out: preserved (sibling harnesses remain)\n");
    report.releaseOptedIn.after = releaseOptedIn;
    humanStdout("result: uninstall recorded\n");
    report.result = "uninstall recorded";
    return finish(opts, report, writeStdout, 0);
  }

  if (!releaseOptedIn) {
    humanStdout("opt_out: already recorded\n");
    report.releaseOptedIn.after = false;
    humanStdout("result: uninstall recorded\n");
    report.result = "uninstall recorded";
    return finish(opts, report, writeStdout, 0);
  }

  if (opts.recordOptOut === undefined) {
    writeStderr("Opt-out state recording is unavailable.\n");
    report.result = "error";
    return finish(opts, report, writeStdout, 1);
  }

  const optOutResult = await opts.recordOptOut();
  if (optOutResult.exitCode !== 0) {
    report.result = "error";
    return finish(opts, report, writeStdout, optOutResult.exitCode);
  }

  humanStdout("opt_out: recorded\n");
  humanStdout("result: uninstall recorded\n");
  report.releaseOptedIn.after = false;
  report.result = "uninstall recorded";
  return finish(opts, report, writeStdout, 0);
}

/**
 * Commander adapter for `arc release setup uninstall`.
 *
 * @param opts - Commander-parsed uninstall options
 */
export async function handleReleaseSetupUninstall(opts: {
  harness?: string;
  json?: boolean;
}): Promise<void> {
  const harness = opts.harness?.trim();
  if (harness === undefined || harness === "") {
    process.stderr.write("error: missing required option --harness\n");
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

  const result = await runReleaseSetupUninstall({
    settings,
    harness,
    json: opts.json,
    readMarker: () => readMarker({ cwd, identity }),
    cleanup: opts.json === true ? undefined : promptForCleanupVerification,
    removeHarness: (name) => removeHarness({ cwd, identity }, name),
    recordOptOut: () => runReleaseOptOut({ exec: gitExec }),
  });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
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

function renderPatterns(patterns: readonly string[], writeStdout: (msg: string) => void): void {
  writeStdout("canonical_patterns:\n");
  for (const pattern of patterns) {
    writeStdout(`pattern: ${pattern}\n`);
  }
}

function resolveCanonicalPatterns(harness: string): string[] {
  const stdout: string[] = [];
  const result = runReleaseSetupPrintPatterns({
    harness,
    format: "raw",
    writeStdout: (msg) => stdout.push(msg),
    writeStderr: () => undefined,
  });
  if (result.exitCode !== 0) return [];
  return stdout.join("").split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
}

function buildJsonEnvelope(opts: {
  harness: string;
  releaseOptedIn: boolean;
  releaseOptedInSource: string;
  harnesses: readonly HarnessEntry[];
}): SetupUninstallJsonEnvelope {
  const harnesses: SetupUninstallJsonEnvelope["harnesses"] = opts.harnesses.map((entry) => ({
    name: entry.name,
    mode: entry.mode,
    installedAt: entry.installedAt,
    result: "existing" as const,
  }));
  if (!opts.harnesses.some((entry) => entry.name === opts.harness)) {
    harnesses.push({
      name: opts.harness,
      result: "not-recorded",
    });
  }

  return {
    schemaVersion: 1,
    command: "uninstall",
    releaseOptedIn: {
      before: opts.releaseOptedIn,
      source: opts.releaseOptedInSource,
      after: opts.releaseOptedIn,
    },
    harnesses,
    result: "not-run",
    exitCode: 0,
  };
}

function finish(
  opts: RunReleaseSetupUninstallOptions,
  report: SetupUninstallJsonEnvelope | null,
  writeStdout: (msg: string) => void,
  exitCode: number,
): RunReleaseSetupUninstallResult {
  if (report !== null) {
    report.exitCode = exitCode;
    if (opts.json === true) {
      writeStdout(`${JSON.stringify(report, null, 2)}\n`);
    }
  }
  return { exitCode };
}

async function promptForCleanupVerification(
  opts: CleanupVerificationOptions,
): Promise<CleanupVerificationResult | null> {
  const confirmed = await p.confirm({
    message: [
      `Remove canonical release-wrapper allowlist entries for ${opts.harness}, then confirm cleanup.`,
      `Patterns:\n${opts.patterns.map((pattern) => `- ${pattern}`).join("\n")}`,
      "If user-curated entries drift from these patterns, do not remove them.",
    ].join("\n\n"),
    initialValue: false,
  });
  if (p.isCancel(confirmed)) return null;
  if (confirmed) return { ok: true };
  return { ok: false, reason: "cleanup not confirmed" };
}

function formatMarkerStorageError(error: MarkerStorageError): string {
  const path = error.path === undefined ? "" : ` (${error.path})`;
  return `Release setup marker error${path}: ${error.message}\n`;
}
