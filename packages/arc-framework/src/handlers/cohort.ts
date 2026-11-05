/** Capability-gated cohort lifecycle command entry points. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { handleDormantStoreCommand } from "./store-command-support.js";
import { runCohortClose, type CohortCloseResult } from "../commands/cohort.js";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-ports.js";
import { createGitExec } from "../lib/io-context.js";
import { requireArcProjectRoot } from "./shared.js";

interface CohortOptions { yes?: boolean; json?: boolean }

/** Preview or close an eligible cohort through the entering checkout's store. */
export async function handleCohortClose(cohort: string, options: CohortOptions, context?: InteractionContext): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec: createGitExec(context?.subprocess) }));
  const result = await runCohortClose(store, { operand: cohort, confirmed: options.yes === true });
  renderClose(result, options.json === true);
}

/** Report the serving operation until cohort removal is available. */
export function handleCohortRemove(_cohort: string, options: CohortOptions, context?: InteractionContext): Promise<void> {
  return handleDormantStoreCommand("cohort remove", options.json === true, context);
}

function renderClose(result: CohortCloseResult, json: boolean): void {
  process.exitCode = result.status === "closed" ? 0 : 1;
  if (json) { process.stdout.write(`${JSON.stringify(result)}\n`); return; }
  if (result.status === "closed") {
    process.stdout.write(`Closed cohort ${result.reference.owner.name}: ${result.placement.quarter}/${result.placement.sequence}${result.placement.closeout}.\n`);
    return;
  }
  const persisted = "persisted" in result && result.persisted === true;
  if (!persisted && "plan" in result && result.plan !== undefined) process.stdout.write(`Close plan: ${result.plan.reference.owner.name} -> completed in ${result.plan.placement.quarter}.\n`);
  process.stderr.write(`${persisted ? "Close persisted; result unavailable. " : ""}Error [${result.refusal.code}]: ${result.refusal.condition} ${result.refusal.remedy.text}\n`);
}
