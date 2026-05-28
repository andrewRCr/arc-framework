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
  runActiveRoster,
  runActiveSessionInitStatus,
  runActiveStatus,
} from "../commands/active.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { gitExec } from "../lib/io-context.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";

export interface ActiveStatusCliOptions {
  sessionInit?: boolean;
  json?: boolean;
}

export interface ActiveRosterCliOptions {
  json?: boolean;
}

export async function handleActiveStatus(opts: ActiveStatusCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  if (opts.sessionInit) {
    const result = await runActiveSessionInitStatus({ cwd, exec: gitExec });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    p.intro("arc active status");
    p.note(buildActiveSessionInitSummary(result), "Session Init");
    p.outro("Done.");
    return;
  }

  const result = await runActiveStatus({ cwd });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc active status");
  p.note(buildActiveStatusSummary(result), "Active");
  p.outro("Done.");
}

export async function handleActiveRoster(opts: ActiveRosterCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const identity = await resolveIdentityWithPrompt(false);
  const { settings } = await readConfigSettings(cwd);
  const teamMode = settings["team.mode"] === "true";

  const result = await runActiveRoster({
    exec: gitExec,
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
