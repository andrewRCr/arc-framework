/** Render the no-argument teardown preview and per-husk cleanup outcomes. */
import * as p from "../lib/terminal.js";
import { runTeardownHuskSweep } from "../lib/work-unit/teardown-husk-sweep.js";
import type { TeardownContext, TeardownParams } from "../lib/work-unit/verbs/teardown.js";
import { refuse } from "./lifecycle-shared.js";

/** Keep confirmation ahead of all retirement and expose every retained path's reason. */
export async function handleTeardownHuskSweep(ctx: TeardownContext,
  options: Pick<TeardownParams, "base" | "protection"> & { confirmed: boolean }): Promise<void> {
  const result = await runTeardownHuskSweep(ctx, options);
  if (result.status === "rejected") { refuse(result.reason); return; }
  if (result.status === "confirmation-required") {
    p.note(result.candidates.join("\n"), "Stamped husks to inspect for removal");
    for (const item of result.left) p.log.warn(`Left: ${item.path} — ${item.reason}`);
    refuse("Re-run arc teardown --yes from outside any husk to confirm removal of eligible stamped husks.");
    return;
  }
  for (const path of result.removed) p.log.info(`Removed: ${path}`);
  for (const item of result.left) p.log.warn(`Left: ${item.path} — ${item.reason}`);
  p.outro(result.removed.length === 0 && result.left.length === 0 ? "No stamped husks to remove."
    : `Husk sweep finished: ${result.removed.length} removed, ${result.left.length} left.`);
}
