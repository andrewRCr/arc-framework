/**
 * Handlers for the `arc errand` subcommands.
 *
 * `queue` resolves the ambient context (identity, today's date), runs the
 * errand orchestrator, and reports — composing a forward-pointing entry into
 * the primary worktree's ERRANDS.md without cutting a branch or committing.
 * `check` is the read half: it runs the deterministic foreign-artifact overlap
 * detection and emits the facts (JSON for skill consumption) so the caller can
 * word an advisory caveat before queuing.
 *
 * `arc errand` is a noun, not a flat verb: it owns these two subcommands and has
 * no default action, mirroring `arc active` / `arc user`. The split keeps the
 * read (`check`, a query) distinct from the write (`queue`, a mutation), and
 * keeps the CLI surface unmistakable next to the `arc-errand` skill.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";

import * as p from "@clack/prompts";

import { runErrand } from "../commands/errand.js";
import { runActiveRoster } from "../commands/active.js";
import { detectForeignArtifactOverlap } from "../lib/git/index.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { isHandledError, requireArcProjectRoot, resolveIdentityWithPrompt, resolveUserIdentity } from "./shared.js";

export interface ErrandQueueOptions {
  /** Merge key + `chore/<slug>` branch name; must be branch-safe. */
  slug?: string;
  /** One-line "what" — the outcome the errand delivers. */
  goal?: string;
  /** Files, symbols, or context the executing session needs to start. */
  pointers?: string;
  /** Optional in-flight coordination advisory composed by the skill. */
  caveat?: string;
}

export interface ErrandCheckOptions {
  /** Target path(s) the errand will edit — matched by prefix against in-flight WUs. */
  target?: string[];
  /** Emit the overlap facts as JSON (for skill consumption). */
  json?: boolean;
}

/** Today's date as `YYYY-MM-DD` — the queue entry's `_Created:_` / staleness age source. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleErrandQueue(opts: ErrandQueueOptions): Promise<void> {
  p.intro("arc errand queue");

  const slug = opts.slug?.trim() ?? "";
  const goal = opts.goal?.trim() ?? "";
  const pointers = opts.pointers?.trim() ?? "";
  const caveat = opts.caveat?.trim();

  const missing = [
    ["slug", slug],
    ["goal", goal],
    ["pointers", pointers],
  ].filter(([, value]) => value === "").map(([key]) => `--${key ?? ""}`);
  if (missing.length > 0) {
    p.log.error(`Missing required option(s): ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const io = createUserIOContext();
  const outcome = await runErrand(io, {
    identity,
    slug,
    goal,
    pointers,
    ...(caveat ? { caveat } : {}),
    created: today(),
  });

  if (!outcome.ok) {
    p.log.error(outcome.reason);
    process.exitCode = 1;
    return;
  }

  const r = outcome.value;
  p.note(
    [
      `Queued:  ${r.slug}`,
      `Branch:  ${r.branch} (cut lazily at execution)`,
      `Queue:   ${r.errandsPath}`,
    ].join("\n"),
    "Errand queued",
  );
  p.outro("Returned to your work unit — service the errand from the primary worktree.");
}

export async function handleErrandCheck(opts: ErrandCheckOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const targetPaths = (opts.target ?? []).map((t) => t.trim()).filter((t) => t !== "");
  if (targetPaths.length === 0) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ overlaps: [] })}\n`);
      return;
    }
    p.intro("arc errand check");
    p.log.error("No --target paths given; nothing to check.");
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  const { settings } = await readConfigSettings(cwd);
  const teamMode = settings["team.mode"] === "true";
  const baseBranch = settings["branch.base"];

  const roster = await runActiveRoster({
    exec: gitExec,
    fs: { readdir: (path) => readdir(path), readFile: (path) => readFile(path, "utf8") },
    identity,
    teamMode,
  });

  const result = await detectForeignArtifactOverlap({
    exec: gitExec,
    roster: { entries: roster.entries, warnings: roster.warnings },
    targetPaths,
    baseBranch,
    originatingWorktreePath: await currentWorktreePath(cwd),
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc errand check");
  if (result.overlaps.length === 0) {
    p.note("No in-flight work unit touches the target — proceed without a caveat.", "Advisory");
  } else {
    const lines = result.overlaps.map(
      (o) => `${o.branch}  touches  ${o.matchedPaths.join(", ")}  (${o.worktreePath})`,
    );
    p.note(lines.join("\n"), "Foreign overlap — coordinate or sequence after it integrates");
  }
  p.outro("Done.");
}

/** The current worktree's root, in `git worktree list` path form (for self-exclusion). */
async function currentWorktreePath(fallback: string): Promise<string> {
  try {
    const { stdout } = await gitExec("git", ["rev-parse", "--show-toplevel"]);
    const top = stdout.trim();
    return top === "" ? fallback : top;
  } catch {
    return fallback;
  }
}
