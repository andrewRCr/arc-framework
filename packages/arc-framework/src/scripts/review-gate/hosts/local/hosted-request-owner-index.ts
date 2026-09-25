/** Keyed owner lookup for a hosted request before current checkout context is consulted. */

import { z } from "zod";

import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import { LaneSubjectLineageSchema, type LaneSubjectLineage } from "../../core/lane-admission.js";
import { HostedRequestEnvelopeSchema, type HostedRequestEnvelope } from "../../hosted/request.js";
import { laneProgressOperationId } from "../../lane-progress.js";

const IndexRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("hosted-request-owner-index/v1"),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  repositoryId: z.string().min(1),
  lineage: LaneSubjectLineageSchema,
  operationId: z.string().min(1),
  logicalPass: z.number().int().positive(),
  completedPassesAtAdmission: z.number().int().nonnegative(),
  phase: z.enum(["reserved", "admitted"]),
});

export type HostedRequestOwnerIndexRecord = z.infer<typeof IndexRecordSchema>;

function fingerprint(repositoryId: string, request: HostedRequestEnvelope): string {
  const parsed = HostedRequestEnvelopeSchema.parse(request);
  return canonicalDigest({
    domain: "arc.review.hosted-request-owner/v1",
    repositoryId,
    target: parsed.target,
    provider: parsed.provider,
    coverage: parsed.coverage,
    correctionScope: parsed.correctionScope ?? null,
    vehicle: parsed.vehicle ?? null,
  });
}

function name(digest: string): string {
  return `hosted-request-owner-${digest.slice("sha256:".length)}.json`;
}

function expectedOperationId(
  repositoryId: string,
  request: HostedRequestEnvelope,
  lineage: LaneSubjectLineage,
): string {
  return laneProgressOperationId({
    lane: "standard",
    repositoryId,
    headSha: request.target.headSha,
    lineage,
  });
}

export class HostedRequestOwnerIndex {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  lockId(repositoryId: string, request: HostedRequestEnvelope): string {
    return `hosted-request-owner/${fingerprint(repositoryId, request)}`;
  }

  async read(repositoryId: string, request: HostedRequestEnvelope): Promise<HostedRequestOwnerIndexRecord | null> {
    const digest = fingerprint(repositoryId, request);
    const raw = await this.publisher.read({ root: "review-gate", namespace: "identity" }, name(digest));
    if (raw === null) return null;
    const record = IndexRecordSchema.parse(JSON.parse(raw) as unknown);
    if (record.fingerprint !== digest
      || record.repositoryId !== repositoryId
      || record.operationId !== expectedOperationId(repositoryId, request, record.lineage)) {
      throw new Error("Hosted request owner index does not match its keyed request.");
    }
    return record;
  }

  async reserve(input: {
    repositoryId: string;
    request: HostedRequestEnvelope;
    lineage: LaneSubjectLineage;
    logicalPass: number;
    completedPassesAtAdmission: number;
    oldAdmissionAbsent(existing: HostedRequestOwnerIndexRecord): Promise<boolean>;
    oldPassCompleted(existing: HostedRequestOwnerIndexRecord): Promise<boolean>;
  }): Promise<"reserved" | "existing" | "collision"> {
    const digest = fingerprint(input.repositoryId, input.request);
    const record = IndexRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "hosted-request-owner-index/v1",
      fingerprint: digest,
      repositoryId: input.repositoryId,
      lineage: input.lineage,
      operationId: expectedOperationId(input.repositoryId, input.request, input.lineage),
      logicalPass: input.logicalPass,
      completedPassesAtAdmission: input.completedPassesAtAdmission,
      phase: "reserved",
    });
    return this.publisher.update({ root: "review-gate", namespace: "identity" }, name(digest), async (raw) => {
      if (raw === null) {
        return { kind: "write", content: `${JSON.stringify(record)}\n`, result: "reserved" as const };
      }
      const existing = IndexRecordSchema.parse(JSON.parse(raw) as unknown);
      if (existing.fingerprint !== digest || existing.repositoryId !== input.repositoryId) {
        throw new Error("Hosted request owner index does not match its keyed request.");
      }
      if (existing.operationId !== expectedOperationId(input.repositoryId, input.request, existing.lineage)) {
        throw new Error("Hosted request owner index does not match its keyed owner.");
      }
      if (existing.logicalPass === record.logicalPass
        && existing.operationId === record.operationId
        && canonicalize(existing.lineage) === canonicalize(record.lineage)) {
        return { kind: "keep", result: "existing" as const };
      }
      if (record.logicalPass > existing.logicalPass && await input.oldPassCompleted(existing)) {
        return { kind: "write", content: `${JSON.stringify(record)}\n`, result: "reserved" as const };
      }
      if (existing.phase === "reserved"
        && record.logicalPass === existing.logicalPass
        && await input.oldAdmissionAbsent(existing)) {
        return { kind: "write", content: `${JSON.stringify(record)}\n`, result: "reserved" as const };
      }
      return { kind: "keep", result: "collision" as const };
    });
  }

  async markAdmitted(input: {
    repositoryId: string;
    request: HostedRequestEnvelope;
    lineage: LaneSubjectLineage;
    logicalPass: number;
  }): Promise<void> {
    const digest = fingerprint(input.repositoryId, input.request);
    const operationId = expectedOperationId(input.repositoryId, input.request, input.lineage);
    await this.publisher.update({ root: "review-gate", namespace: "identity" }, name(digest), (raw) => {
      if (raw === null) throw new Error("Hosted request admission has no reserved owner index.");
      const existing = IndexRecordSchema.parse(JSON.parse(raw) as unknown);
      if (existing.fingerprint !== digest
        || existing.repositoryId !== input.repositoryId
        || existing.operationId !== operationId
        || existing.logicalPass !== input.logicalPass
        || canonicalize(existing.lineage) !== canonicalize(input.lineage)) {
        throw new Error("Hosted request admission owner index changed before provider dispatch.");
      }
      return existing.phase === "admitted"
        ? { kind: "keep", result: undefined }
        : {
            kind: "write",
            content: `${JSON.stringify({ ...existing, phase: "admitted" })}\n`,
            result: undefined,
          };
    });
  }
}
