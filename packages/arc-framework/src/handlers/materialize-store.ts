/** Render widened materialize candidates without expanding remote artifact branches. */
import { basename } from "node:path";
import * as p from "../lib/terminal.js";
import type { UserIOContext } from "../commands/user/types.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { runMaterialize } from "../lib/work-unit/verbs/materialize.js";
import { listStoreMaterializable } from "../lib/work-unit/verbs/materialize-store.js";
import type { ExecuteTransitionContext } from "../lib/work-unit/lifecycle-executor.js";
import type { readConfigSettings } from "../lib/config/status-reader.js";

/** Materialize owned operational work, with branch absence rendered as a detached placement. */
export async function handleStoreMaterialize(input: { name?: string; here?: boolean }, ctx: {
  cwd: string; identity: string; io: UserIOContext; executor: ExecuteTransitionContext;
}, settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"]): Promise<void> {
  if (input.name === undefined) {
    try {
      const candidates = await listStoreMaterializable({ ...ctx.executor, cwd: ctx.cwd, exec: ctx.io.exec }, ctx.identity);
      refuse(`arc materialize <slug> requires a name. Available owned work units: ${candidates.map((entry) => entry.reference.owner.name).join(", ") || "[none]"}.`);
    } catch (error) { refuse(String(error)); }
    return;
  }
  const primary = input.here ? undefined : await resolvePrimaryWorktreePath(ctx.io.exec);
  if (primary === null) { refuse("Could not resolve the primary checkout for materialization."); return; }
  const result = await runMaterialize(ctx.executor, { name: input.name, baseBranch: settings["branch.base"], identity: ctx.identity, spawningIdentity: ctx.identity,
    ...(input.here ? { inPlace: true } : { locationTemplate: settings["worktree.location_template"], repo: basename(primary ?? ctx.cwd),
      primaryWorktreePath: primary, registeredHarnessDirs: settings["worktree.harness_dirs"], postCreateScript: settings["worktree.post_create"] }),
  });
  if (result.status === "rejected") { refuse(result.reason); return; }
  p.note(`Work unit: ${input.name}\nCheckout: ${result.branch ?? (input.here ? "current HEAD preserved" : "detached")}\nWorktree: ${result.worktreePath}`, "Materialized");
  for (const advisory of result.advisories) p.log.info(advisory);
  p.outro("Done.");
}
function refuse(reason: string): void { p.log.error(reason); process.exitCode = 1; }
