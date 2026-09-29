/**
 * Handlers for the `arc active` subcommands.
 *
 * `status` branches on scope (`--session-init`) and format (`--json`); `--json`
 * bypasses Clack and writes the typed result to stdout for harness consumption,
 * default renders a Clack note. `roster` emits the cross-worktree in-flight
 * work-unit roster — the activation-time concurrency advisory's data input.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";

import * as p from "@clack/prompts";

import {
  buildActiveSessionInitSummary,
  buildActiveStatusSummary,
  runActiveInFlightExpansion,
  runActiveRoster,
  runActiveSessionInitStatus,
  runActiveStatus,
} from "../commands/active.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  renderInFlightWarning,
  type InFlightEntry,
} from "../lib/git/in-flight-derivation.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import { createGitExec, gitExecInput } from "../lib/io-context.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";

export interface ActiveStatusCliOptions {
  sessionInit?: boolean;
  json?: boolean;
}

export interface ActiveRosterCliOptions {
  json?: boolean;
}

export interface ActiveInFlightCliOptions {
  json?: boolean;
  /** `--local`: skip the network read, derive from local refs. */
  local?: boolean;
  /** `--no-fetch`: Commander sets `fetch === false` — same effect as `--local`. */
  fetch?: boolean;
}

const activeMachineMode = (option: "json" | "session-init") => declareCliOptionSite(option, {
  acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
  automation: { noInput: "same", flags: [`--${option}`], acceptedSyntax: [] },
  mutationBoundary: "output selection", subprocess: "none",
});

/** Machine-output policies owned by the active command adapters. */
export const activeCommandInputPolicyDeclarations = [
  { commandPath: "active in-flight", aliases: [], sites: [activeMachineMode("json")] },
  { commandPath: "active roster", aliases: [], sites: [activeMachineMode("json")] },
  { commandPath: "active status", aliases: [], sites: [activeMachineMode("json"), activeMachineMode("session-init")] },
] satisfies readonly CommandInputDeclaration[];

/** Render one oracle entry with its lifecycle and local/remote location. */
export function formatActiveInFlightLine(entry: InFlightEntry): string {
  const where = entry.worktreePath ?? (entry.remoteOnly ? "remote-only" : "no worktree");
  return entry.kind === "work-unit"
    ? `${entry.branch}  (${entry.state})  ${where}`
    : `${entry.branch}  (errand)  ${where}`;
}

export async function handleActiveStatus(
  opts: ActiveStatusCliOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const exec = createGitExec(interaction?.subprocess);

  if (opts.sessionInit) {
    const result = await runActiveSessionInitStatus({ cwd, exec });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    p.intro("arc active status");
    p.note(buildActiveSessionInitSummary(result), "Session Init");
    p.outro("Done.");
    return;
  }

  const result = await runActiveStatus({ cwd, exec });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc active status");
  p.note(buildActiveStatusSummary(result), "Active");
  p.outro("Done.");
}

export async function handleActiveRoster(
  opts: ActiveRosterCliOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const exec = createGitExec(interaction?.subprocess);

  const identity = await resolveIdentityWithPrompt(false, exec);
  const { settings } = await readConfigSettings(cwd);
  const teamMode = settings["team.mode"] === "true";

  const result = await runActiveRoster({
    exec,
    fs: {
      readdir: (path) => readdir(path),
      readFile: (path) => readFile(path, "utf8"),
    },
    identity,
    teamMode,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc active roster");
  if (result.entries.length === 0) {
    p.note("No other work units in flight.", "In-flight");
  } else {
    const lines = result.entries.map(
      (e) => `${e.branch}  (${e.state ?? "unknown"})  ${e.worktreePath}`,
    );
    p.note(lines.join("\n"), "In-flight");
  }
  p.outro("Done.");
}

export async function handleActiveInFlight(
  opts: ActiveInFlightCliOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const exec = createGitExec(interaction?.subprocess);

  const identity = await resolveIdentityWithPrompt(false, exec);
  const { settings } = await readConfigSettings(cwd);
  const teamMode = settings["team.mode"] === "true";
  const localOnly = Boolean(opts.local) || opts.fetch === false;
  const parkedSlugs = listParkedSlugs(
    await buildLifecycleIndex({
      cwd,
      fs: {
        readdir: (path) => readdir(path, { withFileTypes: true }),
        readFile: (path) => readFile(path, "utf8"),
      },
    }),
  );

  const result = await runActiveInFlightExpansion({
    exec,
    execInput: gitExecInput,
    cwd,
    identity,
    teamMode,
    localOnly,
    baseBranch: settings["branch.base"],
    parkedSlugs,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.candidateExpansion.status === "partial" || result.candidateExpansion.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  p.intro("arc active in-flight");
  const expansionNotice = result.remoteEvidence === "pending-fetch"
    ? `\n[expansion partial — ${result.candidateExpansion.pendingBranchCount} advertised branches remain unavailable]`
    : result.remoteEvidence === "unreachable"
      ? `\n[expansion failed — remote ${result.failureReason}]`
      : "";
  if (result.entries.length === 0) {
    p.note(`No work units or errands in flight.${expansionNotice}`, "In-flight");
  } else {
    const lines = result.entries.map(formatActiveInFlightLine);
    p.note(`${lines.join("\n")}${expansionNotice}`, "In-flight");
  }
  for (const warning of result.warnings) {
    p.log.warn(renderInFlightWarning(warning));
  }
  p.outro("Done.");
  if (result.candidateExpansion.status === "partial" || result.candidateExpansion.status === "failed") {
    process.exitCode = 1;
  }
}
