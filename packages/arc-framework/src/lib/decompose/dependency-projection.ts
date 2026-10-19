/** Pure ordered dependency redistribution over record generations. */
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeDependencyFacts } from "./dependency-facts.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";
import { replaceDependencySlot } from "./dependency-slot.js";
import { decomposeDependencyContributions, type DecomposeDependencyContribution } from "./dependency-contributions.js";
import { checkDecomposeDependencyRules } from "./dependency-rules.js";

/** Seeded member edges and final existing-recipient edits from all ordered contributions. */
export interface DecomposeDependencyProjection {
  members: readonly { destinationId: string; slug: string; dependsOn: readonly string[] }[];
  edits: readonly { primary: StoreRecord; beforeTargets: readonly string[]; afterTargets: readonly string[]; locus: string }[];
}
interface Recipient {
  primary?: StoreRecord;
  destinationId: string | null;
  slug: string;
  beforeTargets: readonly string[];
  targets: string[];
  locus?: string;
}

/** Project dependencies by recipient UID; terminal planning excludes members whose seeds already landed. */
export function projectDecomposeDependencies(map: CutMap, facts: DecomposeDependencyFacts,
  phase: "additive" | "terminal" = "additive"): DecomposeResult<DecomposeDependencyProjection> {
  const rule = checkDecomposeDependencyRules(map, facts);
  if (rule !== undefined) return rule;
  const acquired = recipientState(map, facts);
  if (acquired.status === "refused") return acquired;
  const { state, permitted } = acquired.result;
  const originNames = new Set<string>([map.machine.origin.slug, ...(facts.origin.aliases ?? [])]);
  for (const contribution of decomposeDependencyContributions(map, permitted)) {
    const recipient = state.get(contribution.recipient);
    if (recipient === undefined) return decomposeMapRuleRefusal("authoring-identity", contribution.locus,
      "Bind the map to its current dependency recipients with a fresh preflight, or revise the stored cut, then retry.");
    if ((phase === "terminal" && recipient.primary?.placement?.kind !== "backlog")
      || (contribution.kind === "incoming" && recipient.primary?.placement?.kind !== "backlog")) continue;
    const refused = applyContribution(map, recipient, contribution, originNames);
    if (refused !== undefined) return refused;
  }
  if (map.authoring.shape !== "extraction") {
    const retained = [...state.values()].find(recipient => recipient.locus !== undefined && recipient.targets.some(target => originNames.has(target)));
    if (retained?.locus !== undefined) return decomposeMapRuleRefusal("origin-reference-remains", retained.locus,
      "Remove the retired origin from this recipient's projected dependencies, then retry.");
  }
  return { status: "ok", result: {
    members: phase === "additive" ? [...state.values()].flatMap(recipient => recipient.primary === undefined && recipient.destinationId !== null
      ? [{ destinationId: recipient.destinationId, slug: recipient.slug, dependsOn: recipient.targets }] : []) : [],
    edits: [...state.values()].flatMap(recipient => recipient.primary !== undefined && recipient.locus !== undefined
      && JSON.stringify(recipient.targets) !== JSON.stringify(recipient.beforeTargets)
      ? [{ primary: recipient.primary, beforeTargets: recipient.beforeTargets, afterTargets: recipient.targets, locus: recipient.locus }] : []),
  } };
}

function applyContribution(map: CutMap, recipient: Recipient, contribution: DecomposeDependencyContribution,
  originNames: ReadonlySet<string>): DecomposeRefusal | undefined {
  if (contribution.kind !== "incoming" && recipient.targets.includes(contribution.provider)) {
    return unchangedContribution(contribution.locus);
  }
  const after = contribution.kind === "incoming" ? replaceDependencySlot(recipient.targets, originNames, contribution.replacements)
    : [...recipient.targets, contribution.provider];
  if (JSON.stringify(after) === JSON.stringify(recipient.targets)) {
    return map.authoring.shape === "extraction" && contribution.kind === "incoming" ? undefined : unchangedContribution(contribution.locus);
  }
  recipient.targets = after;
  recipient.locus = contribution.locus;
  return undefined;
}

function unchangedContribution(locus: string): DecomposeRefusal {
  return decomposeMapRuleRefusal("unchanged-dependency-slot", locus,
    "Remove the redundant contribution or choose a disposition that changes its recipient's provider slot, then retry.");
}

function recipientState(map: CutMap, facts: DecomposeDependencyFacts): DecomposeResult<{
  state: Map<string, Recipient>; permitted: Map<string, string>;
}> {
  const state = new Map<string, Recipient>(), permitted = new Map<string, string>();
  for (const primary of [...facts.dependents, ...facts.homes.map(home => home.primary)]) {
    const owner = primary.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) return decomposeMapRuleRefusal("source-artifact", `${owner.name}.uid`,
      "Restore the recipient's stored generation identity, then retry.");
    const fields = readLifecycleMetaFields(primary);
    if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
    state.set(owner.uid, { primary, destinationId: null, slug: owner.name, beforeTargets: [...fields.result.dependsOn], targets: [...fields.result.dependsOn] });
  }
  registerDestinations(map, facts, state, permitted);
  return { status: "ok", result: { state, permitted } };
}

function registerDestinations(map: CutMap, facts: DecomposeDependencyFacts, state: Map<string, Recipient>, permitted: Map<string, string>): void {
  for (const destination of map.authoring.destinations) {
    if (destination.kind === "new-member") {
      const key = `member:${destination.slug}`;
      permitted.set(destination.slug, key);
      state.set(key, { destinationId: destination.destinationId, slug: destination.slug, beforeTargets: [], targets: [] });
    } else if (destination.kind === "existing-home" && destination.target.kind === "work-unit") {
      const home = facts.homes.find(candidate => candidate.destinationId === destination.destinationId);
      if (home?.primary.reference.owner.type === "work-item" && home.primary.reference.owner.uid !== undefined) {
        permitted.set(destination.target.slug, home.primary.reference.owner.uid);
        const recipient = state.get(home.primary.reference.owner.uid);
        if (recipient !== undefined) recipient.destinationId = destination.destinationId;
      }
    }
  }
}
