/** Repository-shared monotonic storage for approved advisory dispositions. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  currentApprovedDispositionNode,
  isExactDeliveryMemberBindingAdvance,
  type ApprovedDispositionRecord,
} from "../../core/advisory-records.js";
import { validateDispositionState } from "../../core/dispositions.js";
import type {
  ApprovedDispositionRecordIndex,
  ApprovedDispositionRecordStore,
} from "../../core/ports.js";
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import { LocalReviewRecordStoreError } from "./record-store-error.js";

const RECORD_PREFIX = "disposition-";

function recordName(operationId: string): string {
  return `${RECORD_PREFIX}${canonicalDigest({ operationId }).slice("sha256:".length)}.json`;
}

function parseRecord(raw: string): ApprovedDispositionRecord {
  try {
    const record = ApprovedDispositionRecordSchema.parse(JSON.parse(raw));
    const approvedDispositionLineage = record.approvedDispositionLineage.map((node) => {
      const approvedDisposition = validateDispositionState(node.approvedDisposition);
      if (approvedDisposition.state !== "approved") throw new Error("disposition record requires approval");
      return { ...node, approvedDisposition };
    });
    return ApprovedDispositionRecordSchema.parse({ ...record, approvedDispositionLineage });
  } catch (error) {
    throw new LocalReviewRecordStoreError("malformed-local-disposition", { cause: error });
  }
}

function parseEnumeratedRecord(raw: string): ApprovedDispositionRecord | null {
  try {
    return parseRecord(raw);
  } catch (error) {
    if (error instanceof LocalReviewRecordStoreError
      && error.reason === "malformed-local-disposition") return null;
    throw error;
  }
}

function isFixResponseAdvance(
  existing: ApprovedDispositionRecord,
  next: ApprovedDispositionRecord,
): boolean {
  const existingCurrent = currentApprovedDispositionNode(existing);
  const nextCurrent = currentApprovedDispositionNode(next);
  const errandAdvance = existingCurrent.errandFixResponse === null && nextCurrent.errandFixResponse !== null;
  const deliveryAdvance = existingCurrent.deliveryMemberFixResponse === null
    && nextCurrent.deliveryMemberFixResponse !== null;
  if (Number(errandAdvance) + Number(deliveryAdvance) !== 1) return false;
  const withoutCurrentResponse = (record: ApprovedDispositionRecord): ApprovedDispositionRecord => ({
    ...record,
    approvedDispositionLineage: record.approvedDispositionLineage.map((node) => (
      node.approvedDisposition.dispositionSet.dispositionSetId === record.currentDispositionSetId
        ? { ...node, errandFixResponse: null, deliveryMemberFixResponse: null }
        : node
    )),
  });
  return canonicalize(withoutCurrentResponse(existing)) === canonicalize(withoutCurrentResponse(next));
}

function isDispositionSuccessorAdvance(
  existing: ApprovedDispositionRecord,
  next: ApprovedDispositionRecord,
): boolean {
  if (next.approvedDispositionLineage.length !== existing.approvedDispositionLineage.length + 1) {
    return false;
  }
  const existingCurrent = currentApprovedDispositionNode(existing);
  const nextCurrent = currentApprovedDispositionNode(next);
  if (existingCurrent.errandFixResponse !== null
    || existingCurrent.deliveryMemberFixResponse !== null
    || nextCurrent.errandFixResponse !== null
    || nextCurrent.deliveryMemberFixResponse !== null
    || nextCurrent.predecessorDispositionSetId !== existing.currentDispositionSetId) {
    return false;
  }
  const existingContainer = {
    ...existing,
    currentDispositionSetId: null,
    approvedDispositionLineage: [],
  };
  const nextContainer = {
    ...next,
    currentDispositionSetId: null,
    approvedDispositionLineage: [],
  };
  if (canonicalize(existingContainer) !== canonicalize(nextContainer)) return false;

  const expectedHistorical = existing.approvedDispositionLineage.map((node, index) => (
    index === existing.approvedDispositionLineage.length - 1
      ? { ...node, successorDispositionSetId: next.currentDispositionSetId }
      : node
  ));
  return canonicalize(next.approvedDispositionLineage.slice(0, -1))
    === canonicalize(expectedHistorical);
}

/**
 * Confirm that an approved disposition set remains current for its producing operation.
 *
 * @param store - Approved-disposition store for the current repository.
 * @param producerId - Operation whose approved disposition record owns the set.
 * @param dispositionSetId - Approved set identity bound into pending authority.
 * @returns Whether the exact set is still the operation's current approved disposition.
 */
export async function confirmCurrentDispositionSet(
  store: Pick<ApprovedDispositionRecordStore, "readDispositionRecord">,
  producerId: string,
  dispositionSetId: string,
): Promise<boolean> {
  return (await store.readDispositionRecord(producerId))?.currentDispositionSetId === dispositionSetId;
}

/** Git-common disposition store with exact replay and one monotonic verified-fix response append. */
export class LocalApprovedDispositionRecordStore
implements ApprovedDispositionRecordStore, ApprovedDispositionRecordIndex {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async listDispositionRecords(): Promise<readonly ApprovedDispositionRecord[]> {
    const entries = await this.publisher.snapshot({ root: "review-gate", namespace: "evidence" });
    return entries.flatMap((entry) => {
      if (entry.kind !== "file" || !entry.name.startsWith(RECORD_PREFIX) || !entry.name.endsWith(".json")) {
        return [];
      }
      const record = parseEnumeratedRecord(entry.content);
      return record === null ? [] : [record];
    });
  }

  async readDispositionRecord(operationId: string): Promise<ApprovedDispositionRecord | null> {
    const raw = await this.publisher.read(
      { root: "review-gate", namespace: "evidence" },
      recordName(operationId),
    );
    if (raw === null) return null;
    const record = parseRecord(raw);
    if (record.operationId !== operationId) {
      throw new LocalReviewRecordStoreError("local-disposition-operation-mismatch");
    }
    return record;
  }

  async appendDispositionRecord(
    recordInput: ApprovedDispositionRecord,
  ): Promise<{ dispositionRecordRef: string }> {
    const structurallyParsed = ApprovedDispositionRecordSchema.parse(recordInput);
    const approvedDispositionLineage = structurallyParsed.approvedDispositionLineage.map((node) => {
      const approvedDisposition = validateDispositionState(node.approvedDisposition);
      if (approvedDisposition.state !== "approved") throw new Error("disposition record requires approval");
      return { ...node, approvedDisposition };
    });
    const record = ApprovedDispositionRecordSchema.parse({
      ...structurallyParsed,
      approvedDispositionLineage,
    });
    const name = recordName(record.operationId);
    return this.publisher.update({ root: "review-gate", namespace: "evidence" }, name, (raw) => {
      if (raw !== null) {
        const existing = parseRecord(raw);
        const fixResponseAdvance = isFixResponseAdvance(existing, record);
        const deliveryMemberBindingAdvance = isExactDeliveryMemberBindingAdvance(existing, record);
        const successorAdvance = isDispositionSuccessorAdvance(existing, record);
        if (canonicalize(existing) !== canonicalize(record)
          && !fixResponseAdvance && !deliveryMemberBindingAdvance && !successorAdvance) {
          throw new LocalReviewRecordStoreError("local-disposition-conflict");
        }
        if (fixResponseAdvance || deliveryMemberBindingAdvance || successorAdvance) {
          return {
            kind: "write",
            content: `${JSON.stringify(record)}\n`,
            result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
          };
        }
        return {
          kind: "keep",
          result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
        };
      }
      return {
        kind: "write",
        content: `${JSON.stringify(record)}\n`,
        result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
      };
    });
  }
}
