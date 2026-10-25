/** Keep lifecycle ends and history-only writes visible in the manifest without changing registry records. */
import type { RefChange } from "../../git/ref-transaction.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { BatchCreationReceipt } from "../creation-receipt.js";
import { RecordReferenceSchema } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import type { BatchInput } from "../write.js";
import { readBatchObjects } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { commitRefTree, commitRefTreeOid } from "./write-commits.js";
import { refWriteTargets, type ResolvedBatch } from "./write-resolution.js";
import { writeRefBlob } from "./tree-write.js";

const REGISTRY = "refs/arc/project/registry";
const historyRef = (ref: string): boolean => ref.startsWith("refs/arc/history/");

/** Acquire the registry lock for an operation that may need an otherwise unchanged manifest anchor. */
export function registryAnchorLockRefs(context: RefBackendContext, batch: ResolvedBatch): string[] {
  const targets = refWriteTargets(context, batch);
  if (targets.some(({ home }) => home.ref === REGISTRY)) return [];
  const mayEnd = batch.writes.some(({ mutation, home }) => mutation.action === "remove"
    ? home.ref.startsWith("refs/arc/work/") && batch.tips.has(home.ref)
    : mutation.placement?.kind === "completed"
      && ["work-item/meta", "work-item/record", "cohort/document"].includes(mutation.reference.kind));
  return mayEnd || targets.some(({ home }) => historyRef(home.ref)) ? [REGISTRY] : [];
}

interface ManifestAnchorBasis {
  changes: readonly RefChange[]; ended: boolean; tips: ReadonlyMap<string, string>;
  provenance: BatchInput["provenance"]; batchId: string; receipt: BatchCreationReceipt; actor: string | undefined;
}

/** Add one unchanged registry commit only after the batch has concrete end or history-only changes. */
export async function anchorRefWriteManifest(context: RefBackendContext, basis: ManifestAnchorBasis): Promise<StoreResult<RefChange[]>> {
  const { changes, tips, provenance, batchId, actor, receipt } = basis;
  if (!changes.length || changes.some(({ ref }) => ref === REGISTRY)
    || !basis.ended && !changes.every(({ ref }) => historyRef(ref))) return { status: "ok", result: [...changes] };
  const objects = await readBatchObjects(context, projectIdentityQueries(tips));
  const owner = projectOwnerFromObjects(tips, objects);
  if (owner.status === "refused") return owner;
  const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: owner.result });
  const parent = tips.get(REGISTRY);
  let next: string;
  if (parent) {
    const tree = objects.get(`${parent}^{tree}`);
    if (tree?.type !== "tree") throw new Error("The project owner resolved without its captured registry tree");
    next = await commitRefTreeOid(context, tree.oid, parent, provenance, reference, batchId, actor, receipt);
  } else {
    const home = expandStoredPath(reference, { registry: context.registry });
    const oid = await writeRefBlob(context, canonicalize({ formatVersion: 1, formats: {} }));
    next = await commitRefTree(context, [{ path: home.metadataPath, mode: "100644", oid }], undefined,
      provenance, reference, batchId, actor, receipt);
  }
  return { status: "ok", result: [...changes, { ref: REGISTRY, next, expected: parent ?? null }] };
}
