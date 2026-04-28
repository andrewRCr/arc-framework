/**
 * Handler for `arc extensions status` subcommand.
 *
 * Branches on three orthogonal surfaces — scope (`--session-init`),
 * detail (`--all`), and format (`--json`). The shapes are composable:
 * `--session-init --json` and `--all --json` both route through the same
 * probe + JSON stringify path.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  buildExtensionsSessionInitSummary,
  buildExtensionsStatusSummary,
  runExtensionsSessionInitStatus,
  runExtensionsStatus,
} from "../commands/extensions.js";
import { requireArcProjectRoot } from "./shared.js";

export interface ExtensionsStatusCliOptions {
  sessionInit?: boolean;
  all?: boolean;
  json?: boolean;
}

export async function handleExtensionsStatus(opts: ExtensionsStatusCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  if (opts.sessionInit) {
    const result = await runExtensionsSessionInitStatus({ cwd });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    p.intro("arc extensions status");
    p.note(buildExtensionsSessionInitSummary(result), "Session Init");
    p.outro("Done.");
    return;
  }

  const result = await runExtensionsStatus({
    cwd,
    includeOrphanDetails: Boolean(opts.all),
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc extensions status");
  p.note(buildExtensionsStatusSummary(result), "Extensions");
  p.outro("Done.");
}
