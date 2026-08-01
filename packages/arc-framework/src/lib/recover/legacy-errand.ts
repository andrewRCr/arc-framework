/** Bounded selection of one pre-locus Errand that can use legacy close once. */

import { z } from "zod";

import type { MetaFileCandidate } from "../../commands/active/types.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";
import { LocusOpaqueTextSchema } from "../locus/schema/index.js";

/** Exact legacy identity and parent-meta evidence required by recovery. */
export const LegacyErrandRecoveryCandidateSchema = z.strictObject({
  slug: LocusOpaqueTextSchema,
  branch: LocusOpaqueTextSchema,
  returnBranch: LocusOpaqueTextSchema,
  parentMetaPath: LocusOpaqueTextSchema,
});

export type LegacyErrandRecoveryCandidate = z.infer<typeof LegacyErrandRecoveryCandidateSchema>;
type LegacyErrandRecordV2 = Extract<TransientIdentityRecord, { version: 2 }>
  & { returnBranch: string };

/** Select one current-branch v2 identity whose return branch has one exact active meta. */
export function selectLegacyErrandRecoveryCandidate(options: {
  currentBranch: string | null;
  records: readonly TransientIdentityRecord[];
  activeCandidates: readonly MetaFileCandidate[];
}): LegacyErrandRecoveryCandidate | null {
  if (options.currentBranch === null) return null;
  const records = options.records.filter((record): record is LegacyErrandRecordV2 =>
    record.version === 2
    && record.returnBranch !== undefined
    && record.branch === options.currentBranch);
  if (records.length === 0) return null;
  if (records.length !== 1 || records[0] === undefined) {
    throw new Error(`Legacy Errand recovery is ambiguous on branch '${options.currentBranch}'`);
  }
  const record = records[0];
  const parents = options.activeCandidates.filter((candidate) => candidate.branch === record.returnBranch);
  if (parents.length !== 1 || parents[0] === undefined) {
    throw new Error(
      `Legacy Errand '${record.slug}' does not resolve one active parent meta for '${record.returnBranch}'`,
    );
  }
  return LegacyErrandRecoveryCandidateSchema.parse({
    slug: record.slug,
    branch: record.branch,
    returnBranch: record.returnBranch,
    parentMetaPath: parents[0].path,
  });
}
