/**
 * `arc release opt-in` / `opt-out` / `status` sub-command orchestrators.
 *
 * `opt-in` writes `arc.releaseOptedIn: true` to per-developer git config
 * (local scope) — idempotent on already-`true`. `opt-out` writes
 * `arc.releaseOptedIn: false` to the same scope — idempotent on
 * already-`false`. Both follow the same pre-check shape: read existing,
 * skip if matching, otherwise set; failures surface via the injectable
 * `writeStderr` sink with the key name and the underlying git error.
 *
 * `opt-out` writes `false` rather than unsetting because there is no other
 * configurable surface for this preference — the key is per-developer only.
 * Writing `false` explicitly captures an intentional opt-out so the resolver
 * returns the user's choice rather than the documented default.
 *
 * `status` renders the resolved opt-in flag, interlock states, harness setup
 * posture, active value layers, and release-wrapper routing — human-readable
 * lines or a `schemaVersion: 2` JSON envelope.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import {
  RELEASE_OPTED_IN_GIT_CONFIG_KEY,
  resolveAllSettings,
  type ResolvedSettingsResult,
} from "../../lib/config/resolved-settings.js";
import {
  gitConfigGet,
  gitConfigSet,
  resolveIdentity,
  type GitExec,
} from "../../lib/git/index.js";
import { gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { resolveReleaseRouting, type ReleaseRoutingValue } from "../../lib/release/routing.js";
import {
  emptyMarker,
  readMarker,
  type HarnessEntry,
  type HarnessMode,
  type MarkerReadResult,
  type MarkerStorageError,
} from "../../lib/release/setup-marker.js";
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
 * `arc.releaseOptedIn = true` to local git config when absent or set to a
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
    existing = await gitConfigGet(deps.exec, RELEASE_OPTED_IN_GIT_CONFIG_KEY);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to read ${RELEASE_OPTED_IN_GIT_CONFIG_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
  if (existing === "true") return { exitCode: 0 };
  try {
    await gitConfigSet(deps.exec, RELEASE_OPTED_IN_GIT_CONFIG_KEY, "true", "local");
    return { exitCode: 0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to set ${RELEASE_OPTED_IN_GIT_CONFIG_KEY}: ${detail}\n`);
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
 * `arc.releaseOptedIn = false` to local git config when absent or set to a
 * non-`false` value; returns no-op success when already `false`. Mirrors
 * `runReleaseOptIn`'s pre-check shape so the two halves of the surface stay
 * symmetric — opt-out captures an intentional decline so the resolver
 * returns the user's choice rather than the documented default.
 */
export async function runReleaseOptOut(
  deps: RunReleaseOptDeps,
): Promise<RunReleaseOptResult> {
  const writeStderr = deps.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });
  let existing: string | undefined;
  try {
    existing = await gitConfigGet(deps.exec, RELEASE_OPTED_IN_GIT_CONFIG_KEY);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to read ${RELEASE_OPTED_IN_GIT_CONFIG_KEY}: ${detail}\n`);
    return { exitCode: 1 };
  }
  if (existing === "false") return { exitCode: 0 };
  try {
    await gitConfigSet(deps.exec, RELEASE_OPTED_IN_GIT_CONFIG_KEY, "false", "local");
    return { exitCode: 0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeStderr(`Failed to set ${RELEASE_OPTED_IN_GIT_CONFIG_KEY}: ${detail}\n`);
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
  /** Pre-read release setup marker for the current identity. */
  marker?: MarkerReadResult;
  /** Emit the JSON envelope instead of human-readable lines. */
  json?: boolean;
  /** Sink for rendered output. Defaults to `process.stdout.write`. */
  writeStdout?: (msg: string) => void;
  /** Sink for errors. Defaults to `process.stderr.write`. */
  writeStderr?: (msg: string) => void;
}

export interface RunReleaseStatusResult {
  exitCode: number;
}

interface ReleaseStatusHarness {
  name: string;
  mode: HarnessMode;
  installedAt: string;
  annotation?: string;
}

interface ReleaseStatusJsonEnvelope {
  schemaVersion: 2;
  releaseOptedIn: { value: boolean; source: string };
  commitInterlock: { value: string; source: string };
  pushInterlock: { value: string; source: string };
  syncInterlock: { value: string; source: string };
  harnesses: ReleaseStatusHarness[];
  activeValueLayers: string;
  releaseRouting: ReleaseRoutingValue;
}

/**
 * Run the `arc release status` sub-command. Renders the resolved opt-in flag
 * and three interlock states with provenance — human-readable lines by
 * default, or a `schemaVersion: 2` JSON envelope under `json: true`.
 *
 * `releaseOptedIn` flows through the resolver as `"true"` / `"false"` and is
 * surfaced as a JSON / TypeScript boolean at the envelope boundary so
 * downstream consumers (status integration, CI parsers) get native types.
 */
export function runReleaseStatus(
  deps: RunReleaseStatusDeps,
): RunReleaseStatusResult {
  const writeStdout = deps.writeStdout ?? ((msg) => {
    process.stdout.write(msg);
  });
  const writeStderr = deps.writeStderr ?? ((msg) => {
    process.stderr.write(msg);
  });
  const { resolved } = deps.settings;
  const releaseOptedInValue = resolved.releaseOptedIn.value === "true";
  const marker = deps.marker ?? { ok: true, marker: emptyMarker() };

  if (!marker.ok) {
    writeStderr(formatMarkerReadError(marker.error));
    return { exitCode: 1 };
  }

  const harnesses = marker.marker.harnesses.map(projectHarness);
  const activeValueLayers = deriveActiveValueLayers(
    releaseOptedInValue,
    marker.marker.harnesses,
  );
  const releaseRouting = resolveReleaseRouting({
    releaseOptedIn: releaseOptedInValue,
    commitInterlock: resolved.commitInterlock.value,
    pushInterlock: resolved.pushInterlock.value,
  });

  if (deps.json === true) {
    const envelope: ReleaseStatusJsonEnvelope = {
      schemaVersion: 2,
      releaseOptedIn: { value: releaseOptedInValue, source: resolved.releaseOptedIn.source },
      commitInterlock: { value: resolved.commitInterlock.value, source: resolved.commitInterlock.source },
      pushInterlock: { value: resolved.pushInterlock.value, source: resolved.pushInterlock.source },
      syncInterlock: { value: resolved.syncInterlock.value, source: resolved.syncInterlock.source },
      harnesses,
      activeValueLayers,
      releaseRouting,
    };
    writeStdout(`${JSON.stringify(envelope, null, 2)}\n`);
    return { exitCode: 0 };
  }

  writeStdout(`release_opted_in: ${String(releaseOptedInValue)} (${resolved.releaseOptedIn.source})\n`);
  writeStdout(`commit_interlock: ${resolved.commitInterlock.value} (${resolved.commitInterlock.source})\n`);
  writeStdout(`push_interlock: ${resolved.pushInterlock.value} (${resolved.pushInterlock.source})\n`);
  writeStdout(`sync_interlock: ${resolved.syncInterlock.value} (${resolved.syncInterlock.source})\n`);
  writeStdout("\n");
  renderHarnesses(marker.marker.harnesses, writeStdout);
  writeStdout(`active_value_layers: ${activeValueLayers}\n`);
  writeStdout("release_routing:\n");
  writeStdout(`  task_commit: ${releaseRouting.taskCommit}\n`);
  writeStdout(`  workflow_commit: ${releaseRouting.workflowCommit}\n`);
  writeStdout(`  workflow_push: ${releaseRouting.workflowPush}\n`);
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
  const identity = await resolveIdentity({ exec: gitExec });
  const marker = await readMarker({ cwd, identity });
  const result = runReleaseStatus({ settings, marker, json: opts.json });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

function projectHarness(entry: HarnessEntry): ReleaseStatusHarness {
  if (entry.mode === "bypass") {
    return {
      name: entry.name,
      mode: entry.mode,
      installedAt: entry.installedAt,
      annotation: "no harness gate to bypass",
    };
  }
  return {
    name: entry.name,
    mode: entry.mode,
    installedAt: entry.installedAt,
  };
}

function deriveActiveValueLayers(
  releaseOptedIn: boolean,
  harnesses: readonly HarnessEntry[],
): string {
  if (!releaseOptedIn) return "none";

  const defaultPromptHarnesses = harnesses
    .filter((entry) => entry.mode === "default-prompt")
    .map((entry) => entry.name);
  if (defaultPromptHarnesses.length === 0) return "validation + audit";
  if (defaultPromptHarnesses.length === harnesses.length) {
    return "validation + audit + harness-prompt bypass";
  }

  return `validation + audit + harness-prompt bypass (${defaultPromptHarnesses.join(", ")} only)`;
}

function renderHarnesses(
  harnesses: readonly HarnessEntry[],
  writeStdout: (msg: string) => void,
): void {
  if (harnesses.length === 0) {
    writeStdout("harnesses: []\n");
    return;
  }

  writeStdout("harnesses:\n");
  for (const entry of harnesses) {
    if (entry.mode === "bypass") {
      writeStdout(`  ${entry.name} (${entry.mode}) — no harness gate to bypass\n`);
      continue;
    }
    writeStdout(`  ${entry.name} (${entry.mode}) — installed ${formatInstallDate(entry.installedAt)}\n`);
  }
}

function formatInstallDate(installedAt: string): string {
  return installedAt.slice(0, 10);
}

function formatMarkerReadError(error: MarkerStorageError): string {
  const path = error.path === undefined ? "" : ` (${error.path})`;
  return `Failed to read release setup marker${path}: ${error.message}\n`;
}
