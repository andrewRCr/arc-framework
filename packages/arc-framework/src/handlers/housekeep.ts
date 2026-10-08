/**
 * Handler for the `arc housekeep` subcommands.
 *
 * `check` is the read half of the between-WU drain: it resolves the live write
 * context (current branch, primary worktree path, `branch.base`) — the same
 * context `arc errand` resolves — and classifies the invocation so the
 * `arc-housekeep` skill/workflow enforces its base-branch-write precondition
 * mechanically rather than by prose. `--json` emits the classification shape the
 * skill consumes; the human path words the verdict and exits non-zero on a
 * refusal so the guard reads as a guard.
 *
 * `arc housekeep` is a noun with no default action, mirroring `arc errand` —
 * keeping the read (`check`, a query) distinct and the CLI surface unmistakable
 * next to the `arc-housekeep` skill.
 *
 * @module
 */

import * as p from "../lib/terminal.js";

import { resolveWriteContext } from "../lib/git/write-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import { createGitExec } from "../lib/io-context.js";
import { requireArcProjectRoot } from "./shared.js";

export interface HousekeepCheckOptions {
  /** Emit the write-context classification as JSON (for skill consumption). */
  json?: boolean;
}

/** Machine-output policy owned by the housekeep preflight adapter. */
export const housekeepCommandInputPolicyDeclarations = [{
  commandPath: "housekeep check", aliases: [], sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })],
}] satisfies readonly CommandInputDeclaration[];

export async function handleHousekeepCheck(
  opts: HousekeepCheckOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const exec = createGitExec(interaction?.subprocess);

  const { settings } = await readConfigSettings(cwd);
  const context = await resolveWriteContext({ exec, baseBranch: settings["branch.base"] });
  const branchProtection = settings["branch.protection"] === "full" ? "full" : "partial";

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ...context, branchProtection })}\n`);
    return;
  }

  p.intro("arc housekeep check");
  switch (context.verdict) {
    case "proceed":
      p.note(
        `Base-branch write context (\`${context.currentBranch}\`) — proceed with the drain.`,
        "Write context",
      );
      break;
    case "relocate": {
      const at = context.primaryWorktreePath !== null ? ` at ${context.primaryWorktreePath}` : "";
      p.note(
        `On work-unit branch \`${context.currentBranch}\` — refused. Hop to a base-branch write `
        + `context (\`${context.baseBranch}\`${at}), run the sweep there, and return.`,
        "Write context — relocate",
      );
      process.exitCode = 1;
      break;
    }
    case "refuse":
      p.note(
        context.reason === "detached-head"
          ? "Detached HEAD — no branch to write from. Check out the base branch and re-run."
          : "No base branch resolved (`branch.base` unset) — cannot determine a safe write context.",
        "Write context — refused",
      );
      process.exitCode = 1;
      break;
  }
  p.outro("Done.");
}
