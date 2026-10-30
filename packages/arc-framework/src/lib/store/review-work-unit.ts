/** Repository-qualified work-unit metadata reads for review consumers. */
import { toMetaRecord, type MetaRecord } from "../active/meta-reader.js";
import { readLifecycleMetaFields, workUnitMetaPath } from "./lifecycle-write.js";
import { selectWorkBranchLink, workBranchName } from "./lifecycle-branch.js";
import { createProjectIdentityReader } from "./project-identity.js";
import { readReviewRecord, unwrapReviewRecordResult } from "./kinds/review/access-shared.js";
import type { StoreRecord } from "./read.js";
import type { Store } from "./contract.js";

/** Bound project authority used to reverse a code branch to its work item. */
export interface ReviewWorkUnitLookup { store: Store; projectId?: () => Promise<string> }

/** Exact linked metadata retained independently of any projected file. */
interface ReviewLinkedWorkUnit {
  name: string;
  path: string;
  branch: string;
  record: StoreRecord;
  meta: MetaRecord;
}

/** Resolve one repository-qualified branch and read the exact generation returned by lookup. */
export async function readReviewWorkUnitByRef(input: ReviewWorkUnitLookup,
  headRef: string): Promise<ReviewLinkedWorkUnit | null> {
  const repository = await (input.projectId ?? createProjectIdentityReader(input.store))();
  const branch = workBranchName(headRef);
  const lookup = await input.store.lookup({ kind: "ref", repository, ref: branch });
  if (lookup.status === "refused" && lookup.refusal.code === "not-found") return null;
  const { reference } = unwrapReviewRecordResult(input.store, lookup);
  if (reference.kind !== "work-item/meta") return null;
  const record = await readReviewRecord(input.store, reference);
  if (record === null) throw new Error(`The linked work-unit metadata is missing: ${JSON.stringify(reference)}.`);
  const meta = toMetaRecord(unwrapReviewRecordResult(input.store, readLifecycleMetaFields(record)));
  if (meta === null) throw new Error(`The linked work-unit metadata is incomplete: ${JSON.stringify(reference)}.`);
  const selected = selectWorkBranchLink(record, { repository, currentBranch: branch });
  if (selected.kind === "ambiguous") throw new Error(selected.reason);
  if (selected.kind === "none") throw new Error(`The selected work unit has no branch link for ${branch}.`);
  return { name: reference.owner.name, path: workUnitMetaPath(record), branch: workBranchName(selected.link.ref), record, meta };
}
