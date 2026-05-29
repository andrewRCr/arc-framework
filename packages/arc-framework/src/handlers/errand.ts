/**
 * Handler for `arc errand`. Resolves the ambient context (identity, today's
 * date), runs the errand orchestrator, and reports. A sibling entry verb to
 * `arc start`: where `start` scaffolds a work unit, `errand` queues a
 * forward-pointing errand entry into the primary worktree and returns the
 * originating session to its own context — no branch, no commit.
 *
 * The skill (`arc-errand`) classifies the work and composes the advisory
 * caveat, then invokes this command with the resolved fields; the heavy
 * judgment is upstream, this handler is thin glue over {@link runErrand}.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runErrand } from "../commands/errand.js";
import { createUserIOContext } from "../lib/io-context.js";
import { isHandledError, requireArcProjectRoot, resolveUserIdentity } from "./shared.js";

export interface ErrandOptions {
  /** Merge key + `chore/<slug>` branch name; must be branch-safe. */
  slug?: string;
  /** One-line "what" — the outcome the errand delivers. */
  goal?: string;
  /** Files, symbols, or context the executing session needs to start. */
  pointers?: string;
  /** Optional in-flight coordination advisory composed by the skill. */
  caveat?: string;
}

/** Today's date as `YYYY-MM-DD` — the queue entry's `_Created:_` / staleness age source. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleErrand(opts: ErrandOptions): Promise<void> {
  p.intro("arc errand");

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
