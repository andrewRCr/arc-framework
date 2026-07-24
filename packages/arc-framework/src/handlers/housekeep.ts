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

import * as p from "@clack/prompts";
import { basename } from "node:path";
import { z } from "zod";

import { resolveWriteContext } from "../lib/git/write-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { createGitExec, createUserIOContext } from "../lib/io-context.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";
import { openHousekeepAtRuntime } from "../lib/housekeep/open-runtime.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { createLocusMutationResult } from "../lib/locus/mutation.js";
import { formatErrandOpenResult } from "./errand.js";
import { closeHousekeepAtRuntime, settleHousekeepAtRuntime } from "../lib/housekeep/lifecycle-runtime.js";
import { markCurrentInboxEntriesExecuteBound } from "../commands/user.js";

export interface HousekeepCheckOptions {
  /** Emit the write-context classification as JSON (for skill consumption). */
  json?: boolean;
}

export interface HousekeepOpenOptions {
  json?: boolean;
}

export interface HousekeepMarkExecuteOptions {
  json?: boolean;
}

export interface HousekeepCloseOptions { json?: boolean }
export interface HousekeepAbandonOptions { json?: boolean }

/** Mark one confirmed execute-now batch into the durable global queue. */
export async function handleHousekeepMarkExecute(
  titles: string[],
  opts: HousekeepMarkExecuteOptions,
): Promise<void> {
  if (opts.json !== true) p.intro("arc housekeep mark-execute");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) { emitHousekeepMarkError("identity", "No identity resolved.", opts.json === true); return; }
  const io = createUserIOContext();
  try {
    const marked = await markCurrentInboxEntriesExecuteBound({ cwd, io, identity, titles });
    const result = {
      mode: "housekeep-mark-execute",
      outcome: marked.changed ? "applied" : "idempotent",
      entries: marked.outcomes,
      recommendedPromptText: marked.changed
        ? `Marked ${marked.outcomes.length} inbox ${marked.outcomes.length === 1 ? "entry" : "entries"} execute-bound.`
        : "The selected inbox entries are already execute-bound.",
    } as const;
    if (opts.json === true) process.stdout.write(`${JSON.stringify(result)}\n`);
    else { p.log.success(result.recommendedPromptText); p.outro("Done."); }
  } catch (error) {
    emitHousekeepMarkError("mutation", error instanceof Error ? error.message : String(error), opts.json === true);
  }
}

function emitHousekeepMarkError(suffix: string, message: string, json: boolean): void {
  const result = {
    mode: "housekeep-mark-execute",
    outcome: "error",
    error: { code: `housekeep.mark-execute.${suffix}`, message },
    recommendedPromptText: "Re-read the inbox entries and retry the execute-bound batch.",
  } as const;
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else p.log.error(`${result.error.code}: ${result.error.message}`);
  process.exitCode = 1;
}

/** Close one exact routing occupancy or finalize its merged tail. */
export async function handleHousekeepClose(slug: string, opts: HousekeepCloseOptions): Promise<void> {
  await handleHousekeepLifecycle(slug, "close", opts.json === true);
}

/** Abandon one exact open or closed-unmerged routing generation. */
export async function handleHousekeepAbandon(slug: string, opts: HousekeepAbandonOptions): Promise<void> {
  await handleHousekeepLifecycle(slug, "abandon", opts.json === true);
}

async function handleHousekeepLifecycle(slug: string, action: "close" | "abandon", json: boolean): Promise<void> {
  if (!json) p.intro(`arc housekeep ${action}`);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) { emitHousekeepLifecycleError(action, "identity", "No identity resolved.", json); return; }
  const io = createUserIOContext();
  if (!io.execInput) {
    emitHousekeepLifecycleError(action, "identity", "The stdin Git boundary is unavailable.", json); return;
  }
  const { settings } = await readConfigSettings(cwd);
  const runtimeOptions = {
    slug, base: settings["branch.base"], identity,
    postCreateScript: settings["worktree.post_create"],
    registeredHarnessDirs: settings["worktree.harness_dirs"], cwd,
    io: { ...io, execInput: io.execInput },
  };
  let result;
  try {
    if (action === "abandon") result = await settleHousekeepAtRuntime({ ...runtimeOptions, action });
    else {
      result = await closeHousekeepAtRuntime(runtimeOptions);
      if ((result.outcome === "applied" || result.outcome === "idempotent")
        && result.identity?.kind === "errand" && result.identity.purpose === "housekeep-routing"
        && result.identity.state === "awaiting-merge") {
        const settled = await settleHousekeepAtRuntime({ ...runtimeOptions, action: "finalize" });
        if (settled.outcome !== "refused" || !settled.recommendedPromptText.includes("not 'merged'")) {
          result = settled.outcome === "applied" || settled.outcome === "idempotent"
            ? createLocusMutationResult({
                ...settled,
                sessionHomePath: result.sessionHomePath,
                restoredParent: result.restoredParent,
                nextOffer: result.nextOffer,
              })
            : settled;
        }
      }
    }
  } catch (error) {
    result = createLocusMutationResult({
      outcome: "error", operation: action === "close" ? "housekeep-close" : "housekeep-abandon",
      error: { code: `locus.housekeep-${action}.handler`, message: error instanceof Error ? error.message : String(error) },
      recommendedPromptText: "Inspect the retained housekeeping identity and session locus before retrying.",
    });
  }
  emitHousekeepResult(result, json);
}

function emitHousekeepLifecycleError(action: "close" | "abandon", suffix: string, message: string, json: boolean): void {
  emitHousekeepResult(createLocusMutationResult({
    outcome: "error", operation: action === "close" ? "housekeep-close" : "housekeep-abandon",
    error: { code: `locus.housekeep-${action}.${suffix}`, message },
    recommendedPromptText: "Resolve the housekeeping configuration error before retrying.",
  }), json);
}

/** Open one confirmed routing sweep. */
export async function handleHousekeepOpen(slug: string, opts: HousekeepOpenOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc housekeep open");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) { emitHousekeepError("identity", "No identity resolved.", opts.json === true); return; }
  const io = createUserIOContext();
  if (!io.execInput) { emitHousekeepError("identity", "The stdin Git boundary is unavailable.", opts.json === true); return; }
  const primary = await resolvePrimaryWorktreePath(io.exec);
  if (primary === null) { emitHousekeepError("topology", "Primary checkout unavailable.", opts.json === true); return; }
  const { settings } = await readConfigSettings(cwd);
  let result;
  try {
    result = await openHousekeepAtRuntime({
      slug,
      protection: settings["branch.protection"] === "full" ? "full" : "partial",
      base: settings["branch.base"], identity, locationTemplate: settings["worktree.location_template"],
      repo: basename(primary), postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"], cwd,
      io: { ...io, execInput: io.execInput },
    });
  } catch (error) {
    result = createLocusMutationResult({
      outcome: "error", operation: "housekeep-open",
      error: { code: "locus.housekeep-open.handler", message: error instanceof Error ? error.message : String(error) },
      recommendedPromptText: "Inspect the routing identity and local role before retrying.",
    });
  }
  emitHousekeepResult(result, opts.json === true);
}

function emitHousekeepResult(result: Parameters<typeof formatErrandOpenResult>[0], json: boolean): void {
  const formatted = formatErrandOpenResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else { p.log.success(formatted.text); p.outro("Done."); }
  process.exitCode = formatted.exitCode;
}

function emitHousekeepError(suffix: string, message: string, json: boolean): void {
  emitHousekeepResult(createLocusMutationResult({
    outcome: "error", operation: "housekeep-open", error: { code: `locus.housekeep-open.${suffix}`, message },
    recommendedPromptText: "Resolve the configuration error before retrying.",
  }), json);
}

/** Registry contributions owned by the value-bearing housekeep commands. */
export const housekeepCommandInputRegistrations = [
  {
    commandPath: "housekeep mark-execute",
    schema: z.object({ titles: z.array(z.string().min(1)).min(1), json: z.boolean().optional() }).strict(),
    schemaFields: { "operand.titles": "titles", "option.json": "json" },
  },
  ...["housekeep open", "housekeep close", "housekeep abandon"].map((commandPath) => ({
    commandPath,
    schema: z.object({ slug: SlugSchema, json: z.boolean().optional() }).strict(),
    schemaFields: { "operand.slug": "slug", "option.json": "json" },
  })),
] as const satisfies readonly CommandInputRegistration[];

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
