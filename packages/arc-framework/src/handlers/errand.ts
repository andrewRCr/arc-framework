/**
 * Handler for the `arc errand check` subcommand.
 *
 * `check` is the read half of errand prep: it runs the foreign-artifact overlap
 * detection over the oracle-backed in-flight set and emits the facts (JSON for
 * skill consumption) so the caller can word an advisory caveat before relocating
 * to the errand's execution locus. Sourcing the oracle (not the local worktree
 * roster) lets the gate see work units in flight on another machine.
 *
 * `arc errand` is a noun, not a flat verb: it owns this subcommand and has no
 * default action, mirroring `arc active` / `arc user`.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runActiveInFlight } from "../commands/active.js";
import { detectForeignArtifactOverlap, projectInFlightToOverlapRoster } from "../lib/git/index.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { cutErrandBranch } from "../lib/session-init/errand-branch-cut.js";
import { gitExec } from "../lib/io-context.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";

export interface ErrandCheckOptions {
  /** Target path(s) the errand will edit — matched by prefix against in-flight WUs. */
  target?: string[];
  /** Emit the overlap facts as JSON (for skill consumption). */
  json?: boolean;
  /** `--local`: skip the oracle's network read; derive from local refs. */
  local?: boolean;
  /** `--no-fetch`: Commander sets `fetch === false` — same effect as `--local`. */
  fetch?: boolean;
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
  const localOnly = Boolean(opts.local) || opts.fetch === false;

  const { entries, reachable } = await runActiveInFlight({
    exec: gitExec,
    identity,
    teamMode,
    localOnly,
  });

  const result = await detectForeignArtifactOverlap({
    exec: gitExec,
    roster: projectInFlightToOverlapRoster(entries),
    targetPaths,
    baseBranch,
    originatingWorktreePath: await currentWorktreePath(cwd),
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ...result, reachable })}\n`);
    return;
  }

  p.intro("arc errand check");
  if (result.overlaps.length === 0) {
    p.note("No in-flight work unit touches the target — proceed without a caveat.", "Advisory");
  } else {
    const lines = result.overlaps.map(
      (o) => `${o.branch}  touches  ${o.matchedPaths.join(", ")}  (${o.worktreePath ?? "remote-only"})`,
    );
    p.note(lines.join("\n"), "Foreign overlap — coordinate or sequence after it integrates");
  }
  if (!reachable && !localOnly) {
    p.log.warn("Remote unreachable — checked local refs only; work in flight on another machine may be missed.");
  }
  p.outro("Done.");
}

/**
 * Cut the `chore/<slug>` errand branch off the configured `branch.base`.
 *
 * The create-side launch mechanic — the workflows (run-errand Launch, the
 * session-init errand cold-entry, drain-inbox's grooming-branch relocation)
 * invoke it instead of hand-running `git branch`. Idempotent: an existing
 * branch of that name is left as-is (no-clobber). Occupying the branch (a
 * worktree or an in-place switch) stays the caller's protection-mode dispatch.
 */
export async function handleErrandCut(slug: string): Promise<void> {
  p.intro("arc errand cut");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  const base = settings["branch.base"].trim();
  if (base === "") {
    p.log.error("No branch.base configured — cannot resolve the base to cut from.");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await cutErrandBranch({ exec: gitExec }, { slug, base });
    if (result.created) p.log.success(`Cut ${result.branch} off ${base}.`);
    else p.log.info(`${result.branch} already exists; left as-is (no-clobber).`);
  } catch (err) {
    p.log.error(`Could not cut the errand branch: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
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
