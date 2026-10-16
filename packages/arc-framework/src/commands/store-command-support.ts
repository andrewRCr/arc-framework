/** Capability boundary for commands introduced before their off-branch implementations. */
import { basename } from "node:path";
import { resolveArcPath } from "../lib/layout/index.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { Store } from "../lib/store/contract.js";

/** The six independently retiring dormant command arms. */
export type DormantStoreCommand = "inbox" | "route" | "locus release" | "errand queue" | "errand queue set" | "handoff write";
/** Stable unsupported command refusal, independent of backend operation refusal cases. */
export interface StoreCommandUnsupported {
  status: "refused";
  refusal: { code: "unsupported"; class: "terminal"; condition: string; remedy: { text: string } };
}
/** Guard a newly registered command until its backend capability and implementation exist.
 * @param command - Exact command path.
 * @param store - Store opened for the entering checkout.
 * @returns Unsupported with the serving operation until the arm lands.
 */
export function runDormantStoreCommand(command: DormantStoreCommand, store: Pick<Store, "capabilities">): StoreCommandUnsupported {
  const condition = store.capabilities.stateOffBranch
    ? `arc ${command} is not implemented for the off-branch store yet.`
    : `arc ${command} requires a store with stateOffBranch capability.`;
  return { status: "refused", refusal: { code: "unsupported", class: "terminal", condition, remedy: { text: servingPath(command) } } };
}

function servingPath(command: DormantStoreCommand): string {
  switch (command) {
    case "inbox": return "Use arc user inbox-list --target <slug> until the store capability flips.";
    case "route": return 'Use route-discovered-work, "Binding: carrying out outcomes", and its until-the-flip hold-and-route binding.';
    case "locus release": return "Use arc park or arc teardown, as appropriate, to release this checkout.";
    case "errand queue":
    case "errand queue set": return "Use arc user inbox-mark-execute-bound to mark and order the execution queue.";
    case "handoff write": {
      const slug = SlugSchema.parse("handoff");
      const label = basename(resolveArcPath({ kind: "user-document", identity: slug, document: { kind: "session-notes", workUnit: slug } }), ".md");
      return `Write ${label} through the existing handoff workflow.`;
    }
  }
}
