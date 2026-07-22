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
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

import { resolveWriteContext } from "../lib/git/write-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";
import { compileHousekeepPlan, parseHousekeepPlan } from "../lib/housekeep/plan.js";
import { openHousekeepAtRuntime } from "../lib/housekeep/open-runtime.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { createLocusMutationResult } from "../lib/locus/mutation.js";
import { formatErrandOpenResult } from "./errand.js";
import { closeHousekeepAtRuntime, settleHousekeepAtRuntime } from "../lib/housekeep/lifecycle-runtime.js";
import { withLockedUserInbox } from "../commands/user.js";

export interface HousekeepCheckOptions {
  /** Emit the write-context classification as JSON (for skill consumption). */
  json?: boolean;
}

export interface HousekeepOpenOptions {
  planFile: string;
  lane: string;
  json?: boolean;
}

export interface HousekeepPlanOptions {
  intentFile: string;
  output: string;
  json?: boolean;
}

export interface HousekeepCloseOptions { json?: boolean }
export interface HousekeepAbandonOptions { json?: boolean }

/** Compile judgment-only dispositions into an exact replayable housekeeping plan. */
export async function handleHousekeepPlan(opts: HousekeepPlanOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc housekeep plan");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) { emitHousekeepPlanError("identity", "No identity resolved.", opts.json === true); return; }
  const io = createUserIOContext();
  try {
    const intent = await readPlanInput(opts.intentFile);
    const transaction = await withLockedUserInbox({ cwd, io, identity }, ({ content }) => {
      if (content === null) throw new Error("USER-INBOX is missing.");
      return { result: compileHousekeepPlan(intent, content) };
    });
    const compiled = transaction.result;
    const bytes = `${compiled.canonicalJson}\n`;
    let outcome: "applied" | "idempotent" = "applied";
    try {
      await writeFile(opts.output, bytes, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (!isAlreadyExists(error) || await readFile(opts.output, "utf8") !== bytes) throw error;
      outcome = "idempotent";
    }
    const result = {
      mode: "housekeep-plan",
      outcome,
      planPath: opts.output,
      routingPlanDigest: compiled.digest,
      recommendedPromptText: `Canonical housekeeping plan written to ${opts.output}.`,
    };
    if (opts.json === true) process.stdout.write(`${JSON.stringify(result)}\n`);
    else { p.log.success(result.recommendedPromptText); p.outro("Done."); }
  } catch (error) {
    emitHousekeepPlanError("compile", error instanceof Error ? error.message : String(error), opts.json === true);
  }
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
      recommendedPromptText: "Inspect the retained housekeeping identity and locus before retrying.",
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

/** Open one confirmed, canonical routing sweep. */
export async function handleHousekeepOpen(slug: string, opts: HousekeepOpenOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc housekeep open");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  if (opts.lane !== "auto" && opts.lane !== "reviewed") {
    emitHousekeepError("input", "--lane must be 'auto' or 'reviewed'.", opts.json === true); return;
  }
  let plan;
  try { plan = parseHousekeepPlan(await readPlanInput(opts.planFile)); }
  catch (error) {
    emitHousekeepError("plan", error instanceof Error ? error.message : String(error), opts.json === true); return;
  }
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
      slug, lane: opts.lane, plan,
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
      recommendedPromptText: "Inspect the routing identity, inbox bindings, and local role before retrying.",
    });
  }
  emitHousekeepResult(result, opts.json === true);
}

async function readPlanInput(path: string): Promise<string> {
  if (path !== "-") return readFile(path, "utf8");
  let content = "";
  process.stdin.setEncoding("utf8");
  for await (const rawChunk of process.stdin) {
    const chunk: unknown = rawChunk;
    if (typeof chunk !== "string") throw new Error("Housekeeping plan stdin was not UTF-8 text.");
    content += chunk;
  }
  return content;
}

function emitHousekeepPlanError(suffix: string, message: string, json: boolean): void {
  const result = {
    mode: "housekeep-plan",
    outcome: "error",
    error: { code: `housekeep.plan.${suffix}`, message },
    recommendedPromptText: "Resolve the routing intent or inbox generation error before retrying.",
  };
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else p.log.error(`${result.error.code}: ${result.error.message}`);
  process.exitCode = 1;
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "EEXIST";
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
    recommendedPromptText: "Resolve the plan or configuration error before retrying.",
  }), json);
}

export async function handleHousekeepCheck(opts: HousekeepCheckOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  const context = await resolveWriteContext({ exec: gitExec, baseBranch: settings["branch.base"] });
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
