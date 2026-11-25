/** Resolve advisory state targets from indexed authority or established physical ownership. */
import { identifyArcFileAddress, type ActiveLayoutContext } from "../layout/index.js";
import { classifyStoreAddress, type ClassifiedStoreTarget } from "../store/target-classification.js";
import type { RecordReference } from "../store/identity.js";
import type { ProjectionIndexRead } from "../store/projection/index-file.js";
import { resolveBacklogOwnership } from "../store/projection/container-ownership.js";
import type { Store } from "../store/contract.js";

/** Exact indexed references survive physical renames and competing filename interpretations. */
export type OverlapStateTarget = ClassifiedStoreTarget & { reference?: RecordReference };
/** State refusals stay outside code probing and carry their repair guidance. */
export interface OverlapTargets {
  code: string[]; state: { path: string; target: OverlapStateTarget }[]; notes: string[];
}

/** Resolve only requested paths; do not scan the store for advisory ownership. */
export async function resolveOverlapTargets(input: {
  store: Store; cwd: string; identity: string; targetPaths: readonly string[];
}, active: ActiveLayoutContext | undefined, read: ProjectionIndexRead): Promise<OverlapTargets> {
  const result: OverlapTargets = { code: [], state: [], notes: [] };
  for (const path of input.targetPaths) {
    const resolved = await resolveTarget(input, path, active, read);
    if (resolved.kind === "refused") result.notes.push(`${path}: ${resolved.note}`);
    else if (resolved.kind === "code") result.code.push(path);
    else if (resolved.target !== null) result.state.push({ path, target: resolved.target });
  }
  return result;
}

type ResolvedTarget = { kind: "code" } | { kind: "state"; target: OverlapStateTarget | null } | { kind: "refused"; note: string };
async function resolveTarget(input: { store: Store; cwd: string; identity: string }, path: string,
  active: ActiveLayoutContext | undefined, read: ProjectionIndexRead): Promise<ResolvedTarget> {
  if (read.kind === "unusable" && /^\.arc\/(?:active|backlog|completed|user)\//u.test(path)) return { kind: "refused",
    note: `The projection index is ${read.cause}; repair the index and retry this overlap check.` };
  const entry = read.kind === "index" ? read.index.entries[path] : undefined;
  if (entry?.kind === "record") return { kind: "state", target: indexedTarget(entry.reference) };
  const address = identifyArcFileAddress(path, { active });
  if (/^\.arc\/backlog\/(?:planned|provisional)\//u.test(path) && address?.kind !== "cohort-document") {
    return resolveBacklogTarget(input, path, read);
  }
  const target = address === null ? null : classifyStoreAddress(address);
  return target === null ? { kind: "code" } : { kind: "state", target };
}

async function resolveBacklogTarget(input: { store: Store; cwd: string; identity: string }, path: string,
  read: ProjectionIndexRead): Promise<ResolvedTarget> {
  const owner = await resolveBacklogOwnership({ checkout: input.cwd, identity: input.identity,
    path, store: input.store, index: read.kind === "index" ? read.index : { entries: {} } });
  if (owner.kind === "refused") return { kind: "refused", note: `${owner.mark.reason} ${owner.mark.remedy.text}` };
  if (owner.kind === "prospective") return { kind: "state", target: null };
  const bound = identifyArcFileAddress(path, { workItem: owner.container });
  const target = bound === null ? null : classifyStoreAddress(bound);
  return { kind: "state", target: target === null ? null : { ...target, reference: owner.record.reference } };
}

function indexedTarget(reference: RecordReference): OverlapStateTarget {
  return { kind: reference.kind, reference,
    ...(reference.owner.type === "work-item" ? { workItem: reference.owner.name } : {}),
    entryList: reference.kind === "work-item/inbound" || reference.kind === "work-item/description" };
}
