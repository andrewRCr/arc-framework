/** Capability-gated cohort lifecycle command entry points. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { runCohortClose, runCohortRemove, type CohortCommandResult } from "../commands/cohort.js";
import type { RecordReference } from "../lib/store/identity.js";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-ports.js";
import { createGitExec } from "../lib/io-context.js";
import { requireArcProjectRoot } from "./shared.js";

interface CohortOptions { yes?: boolean; json?: boolean }

/** Preview or close an eligible cohort through the entering checkout's store. */
export function handleCohortClose(cohort: string, options: CohortOptions, context?: InteractionContext): Promise<void> {
  return handleCohort("close", cohort, options, context);
}

/** Preview or remove an eligible cohort through the entering checkout's store. */
export function handleCohortRemove(cohort: string, options: CohortOptions, context?: InteractionContext): Promise<void> {
  return handleCohort("remove", cohort, options, context);
}

async function handleCohort(operation: "close" | "remove", cohort: string, options: CohortOptions, context?: InteractionContext): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec: createGitExec(context?.subprocess) }));
  const input = { operand: cohort, confirmed: options.yes === true };
  const result = operation === "close" ? await runCohortClose(store, input) : await runCohortRemove(store, input);
  renderCohort(result, options.json === true);
}

function renderCohort(result: CohortCommandResult, json: boolean): void {
  process.exitCode = result.status === "closed" || result.status === "removed" ? 0 : 1;
  if (json) { process.stdout.write(`${JSON.stringify(result)}\n`); return; }
  if (result.status === "closed") {
    process.stdout.write(`Closed cohort ${cohortName(result.reference)}: ${result.placement.quarter}/${result.placement.sequence}${result.placement.closeout}.\n`);
    renderRetirement(result);
    return;
  }
  if (result.status === "removed") { process.stdout.write(`Removed cohort ${cohortName(result.reference)}.\n`); renderRetirement(result); return; }
  renderRefusal(result);
  renderRetirement(result);
}

function renderRetirement(result: CohortCommandResult): void {
  for (const parent of result.parents ?? []) process.stdout.write(`${parent.remedy.text}\n`);
  for (const notice of result.notices ?? []) process.stdout.write(`${notice}\n`);
}

function renderRefusal(result: Extract<CohortCommandResult, { status: "refused" }>): void {
  const persisted = "persisted" in result && result.persisted === true;
  if (!persisted && "plan" in result && result.plan !== undefined) {
    const plan = result.plan, operation = plan.operation === "close" ? "Close" : "Remove";
    const effect = plan.operation === "close" ? `completed in ${plan.placement.quarter}` : "remove its document";
    process.stdout.write(`${operation} plan: ${cohortName(plan.reference)} -> ${effect}.\n`);
  }
  process.stderr.write(`${persisted ? "Change persisted; result unavailable. " : ""}Error [${result.refusal.code}]: ${result.refusal.condition} ${result.refusal.remedy.text}\n`);
}

function cohortName(reference: RecordReference): string {
  const owner = reference.owner;
  return `${owner.name}${owner.type !== "person" && owner.uid !== undefined ? ` (UID ${owner.uid})` : ""}`;
}
