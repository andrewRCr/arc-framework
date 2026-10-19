/** On-demand conflict status over the invocation's selected operational store. */
import { usesOffBranchState } from "../../lib/store/lifecycle-write.js";
import { readStoreConflicts } from "../../lib/status/store-conflicts.js";
import { readStoreConflictToken } from "../../lib/status/store-conflict-token.js";
import { renderStoreConflicts } from "../../lib/status/conflict-render.js";
import type { SessionStatusContext } from "./session-context.js";
import type { StatusCliOptions } from "./input.js";
import { pullStoreStatus } from "./store-locus.js";
import { renderStatusViewRefusal } from "./refusal.js";

/** Render a local inventory or token without writing a projection or resolving a conflict. */
export async function handleConflictStatus(context: SessionStatusContext, opts: StatusCliOptions): Promise<void> {
  const { store, identity } = context;
  if (store === undefined || !usesOffBranchState(store)) {
    renderStatusViewRefusal({ code: "unsupported", condition: "This store keeps conflicts in tracked files.",
      remedy: { text: "Use git status to inspect Git conflicts." } }, opts);
    return;
  }
  const pullWarnings = opts.fetch === true && !opts.local ? await pullStoreStatus({ sync: context.storeSync }) : [];
  const read = typeof opts.conflicts === "string" ? await readStoreConflictToken({ store, identity, token: opts.conflicts })
    : await readStoreConflicts({ store, identity });
  if (read.status === "refused") { renderStatusViewRefusal(read.refusal, opts); return; }
  const result = { conflicts: read.result.conflicts, warnings: [...pullWarnings.map(warning => warning.rendered), ...read.result.warnings] };
  if (!opts.json) for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
  process.stdout.write(`${opts.json ? JSON.stringify(result) : renderStoreConflicts(result.conflicts)}\n`);
}
