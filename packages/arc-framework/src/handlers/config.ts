/**
 * Handler for `arc config status` subcommand.
 *
 * Branches on scope (`--session-init`) and format (`--json`). `--json`
 * bypasses Clack and writes the typed result to stdout for harness
 * consumption; default renders a Clack note.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  buildConfigSessionInitSummary,
  buildConfigStatusSummary,
  runConfigSessionInitStatus,
  runConfigStatus,
} from "../commands/config.js";
import { requireArcProjectRoot } from "./shared.js";

export interface ConfigStatusCliOptions {
  sessionInit?: boolean;
  json?: boolean;
}

export async function handleConfigStatus(opts: ConfigStatusCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  if (opts.sessionInit) {
    const result = await runConfigSessionInitStatus({ cwd });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    p.intro("arc config status");
    p.note(buildConfigSessionInitSummary(result), "Session Init");
    p.outro("Done.");
    return;
  }

  const result = await runConfigStatus({ cwd });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc config status");
  p.note(buildConfigStatusSummary(result), "Config");
  p.outro("Done.");
}
