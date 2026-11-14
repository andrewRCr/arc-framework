/** Capability boundary for commands introduced before their off-branch implementations. */
import type { Store } from "../lib/store/contract.js";
import { cohortCloseStep, cohortRemoveStep, errandQueueStep, handoffWriteStep, inboxListStep, routeStep } from "../lib/store/pre-flip-steps.js";

/** Independently retiring dormant command arms. */
export type DormantStoreCommand = "inbox" | "route" | "locus release" | "errand queue" | "errand queue set" | "handoff write"
  | "cohort close" | "cohort remove";
/** Stable unsupported command refusal, independent of backend operation refusal cases. */
export interface StoreCommandUnsupported {
  status: "refused";
  refusal: { code: "unsupported"; class: "terminal"; condition: string; remedy: { text: string } };
}
/** Guard a newly registered command until its backend capability and implementation exist.
 * @param command - Exact command path.
 * @param store - Store opened for the entering checkout.
 * @param inbox - The list form an `inbox` invocation names, personal when absent.
 * @returns Unsupported with the serving operation until the arm lands.
 */
export function runDormantStoreCommand(command: DormantStoreCommand, store: Pick<Store, "capabilities">,
  inbox: { list: string; target?: string } = { list: "personal" }): StoreCommandUnsupported {
  const condition = store.capabilities.stateOffBranch
    ? `arc ${command} is not implemented for the off-branch store yet.`
    : `arc ${command} requires a store with stateOffBranch capability.`;
  return { status: "refused", refusal: { code: "unsupported", class: "terminal", condition, remedy: { text: servingPath(command, inbox) } } };
}

function servingPath(command: DormantStoreCommand, inbox: { list: string; target?: string }): string {
  switch (command) {
    case "cohort close": return cohortCloseStep();
    case "cohort remove": return cohortRemoveStep();
    case "inbox": return inboxListStep(inbox.list, inbox.target);
    case "route": return routeStep();
    case "locus release": return "Use arc park or arc teardown, as appropriate, to release this checkout.";
    case "errand queue": return errandQueueStep("read");
    case "errand queue set": return errandQueueStep("set");
    case "handoff write": return handoffWriteStep();
  }
}
