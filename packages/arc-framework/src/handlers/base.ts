/**
 * Handler for local base-branch operations.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { readConfigSettings } from "../lib/config/status-reader.js";
import { syncLocalBase, type BaseSyncResult } from "../lib/git/base-sync.js";
import { gitExec } from "../lib/io-context.js";
import { requireArcProjectRoot } from "./shared.js";

/** Options for `arc base sync`. */
export interface BaseSyncOptions {
  /** Emit the typed synchronization outcome as JSON. */
  json?: boolean;
}

function refusalMessage(result: Extract<BaseSyncResult, { status: "refused" }>): string {
  switch (result.reason) {
    case "no-remote":
      return "No `origin` remote is configured.";
    case "fetch-timeout":
      return `Fetching \`origin/${result.base}\` timed out; no local ref changed.`;
    case "fetch-failed":
      return `Could not fetch \`origin/${result.base}\`; no local ref changed.`;
    case "remote-base-missing":
      return `Remote base \`origin/${result.base}\` could not be resolved.`;
    case "distance-unavailable":
      return `Could not compare \`${result.base}\` with its remote; no local ref changed.`;
    case "local-ahead":
      return `Local base \`${result.base}\` is ahead of its remote; refusing to discard commits.`;
    case "diverged":
      return `Local base \`${result.base}\` has diverged from its remote; refusing a non-fast-forward update.`;
    case "worktree-list-failed":
      return "Could not determine whether the base is checked out; refusing an unsafe ref update.";
    case "dirty-base-worktree":
      return `Base worktree at \`${result.worktreePath}\` is dirty; commit or stash its changes first.`;
    case "base-moved":
      return `Local base \`${result.base}\` moved during synchronization; retry from fresh state.`;
    case "update-failed":
      return `Git refused the fast-forward of \`${result.base}\`; inspect the base worktree and retry.`;
  }
}

/** Run `arc base sync`. */
export async function handleBaseSync(opts: BaseSyncOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  const result = await syncLocalBase({ exec: gitExec, baseBranch: settings["branch.base"] });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === "refused") process.exitCode = 1;
    return;
  }

  p.intro("arc base sync");
  if (result.status === "updated") {
    const locus = result.worktreePath === null ? "the local ref" : `the clean worktree at \`${result.worktreePath}\``;
    p.note(
      `Fast-forwarded \`${result.base}\` from \`${result.from ?? "[missing]"}\` to \`${result.to}\` through ${locus}.`,
      "Base synchronized",
    );
  } else if (result.status === "unchanged") {
    p.note(`Local base \`${result.base}\` already matches \`origin/${result.base}\`.`, "Base already current");
  } else {
    p.log.error(refusalMessage(result));
    process.exitCode = 1;
  }
  p.outro("Done.");
}
