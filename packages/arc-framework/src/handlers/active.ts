/**
 * Handler for `arc active status` subcommand.
 *
 * Branches on scope (`--session-init`) and format (`--json`). `--json`
 * bypasses Clack and writes the typed result to stdout for harness
 * consumption; default renders a Clack note.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  buildActiveSessionInitSummary,
  buildActiveStatusSummary,
  runActiveSessionInitStatus,
  runActiveStatus,
} from "../commands/active.js";
import { requireArcProjectRoot } from "./shared.js";

export interface ActiveStatusCliOptions {
  sessionInit?: boolean;
  json?: boolean;
}

export async function handleActiveStatus(opts: ActiveStatusCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  if (opts.sessionInit) {
    const result = await runActiveSessionInitStatus({ cwd });
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
