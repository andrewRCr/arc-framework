/** Repository-shared persistence for resumable, non-evidentiary review operations. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  ReviewOperationStateSchema,
  ReviewSuspensionStateSchema,
  type ReviewOperationState,
  type ReviewSuspensionState,
} from "../../core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../../core/ports.js";
import type { GitCommonStatePublisher } from "./git-common-state.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const OPERATION_STORE_SEMANTICS = "review-operation-store/v1" as const;

const ReviewOperationStoreRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal(OPERATION_STORE_SEMANTICS),
  operationId: IdentifierSchema,
  version: z.number().int().positive(),
  state: ReviewOperationStateSchema,
});
type ReviewOperationStoreRecord = z.infer<typeof ReviewOperationStoreRecordSchema>;

const CanonicalReviewSuspensionFactsSchema = z.strictObject({
  operationId: IdentifierSchema,
  observedAt: z.iso.datetime({ offset: true }),
  vehicle: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("work-unit"), identity: IdentifierSchema }),
    z.strictObject({ kind: z.literal("errand"), identity: IdentifierSchema }),
  ]),
  repositoryId: IdentifierSchema,
  changeRequestId: IdentifierSchema.nullable(),
  targetId: CanonicalDigestSchema,
  requestId: CanonicalDigestSchema,
  sourceIdentity: IdentifierSchema,
  generation: z.number().int().nonnegative(),
  policyVersion: CanonicalDigestSchema,
  rubricVersion: IdentifierSchema,
  rubricDigest: CanonicalDigestSchema,
  deadlineAt: z.iso.datetime({ offset: true }),
  wakeupToken: CanonicalDigestSchema,
});

/** Stable local-store failure that callers can branch on without parsing prose. */
export class LocalOperationStateStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "LocalOperationStateStoreError";
  }
}

function recordName(operationId: string): string {
  const digest = canonicalDigest({ operationId }).slice("sha256:".length);
  return `operation-${digest}.json`;
}

function parseRecord(raw: string, operationId: string): ReviewOperationStoreRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LocalOperationStateStoreError("malformed-operation-state");
  }
  const parsed = ReviewOperationStoreRecordSchema.safeParse(value);
  if (!parsed.success) throw new LocalOperationStateStoreError("malformed-operation-state");
  if (parsed.data.operationId !== operationId || parsed.data.state.operationId !== operationId) {
    throw new LocalOperationStateStoreError("operation-id-mismatch");
  }
  return parsed.data;
}

/** Rebuild a suspension only from strict vehicle and host facts observed on the current machine. */
export function reconstructReviewSuspensionState(input: unknown): ReviewSuspensionState {
  const facts = CanonicalReviewSuspensionFactsSchema.parse(input);
  return ReviewSuspensionStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "review-suspension",
    operationId: facts.operationId,
    updatedAt: facts.observedAt,
    vehicle: facts.vehicle,
    repositoryId: facts.repositoryId,
    changeRequestId: facts.changeRequestId,
    targetId: facts.targetId,
    requestId: facts.requestId,
    sourceIdentity: facts.sourceIdentity,
    generation: facts.generation,
    policyVersion: facts.policyVersion,
    rubricVersion: facts.rubricVersion,
    rubricDigest: facts.rubricDigest,
    deadlineAt: facts.deadlineAt,
    wakeupToken: facts.wakeupToken,
  });
}

/** Version-checked operation store backed by the repository's non-evidentiary Git-common namespace. */
export class LocalReviewOperationStateStore implements ReviewOperationStateStore {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async readOperation(operationId: string): Promise<{ version: number; state: ReviewOperationState | null }> {
    const name = recordName(operationId);
    const raw = await this.publisher.read("operations", name);
    if (raw === null) return { version: 0, state: null };
    const record = parseRecord(raw, operationId);
    return { version: record.version, state: record.state };
  }

  async publishOperation(state: ReviewOperationState, expectedVersion: number): Promise<{ version: number }> {
    const canonicalState = ReviewOperationStateSchema.parse(state);
    const name = recordName(canonicalState.operationId);
    return this.publisher.update("operations", name, (raw) => {
      if (raw !== null) {
        const current = parseRecord(raw, canonicalState.operationId);
        if (canonicalize(current.state) === canonicalize(canonicalState)) {
          return { content: null, result: { version: current.version } };
        }
        if (current.version !== expectedVersion) {
          throw new LocalOperationStateStoreError("version-conflict");
        }
        const next = ReviewOperationStoreRecordSchema.parse({
          ...current,
          version: current.version + 1,
          state: canonicalState,
        });
        return { content: `${JSON.stringify(next)}\n`, result: { version: next.version } };
      }
      if (expectedVersion !== 0) throw new LocalOperationStateStoreError("version-conflict");
      const next = ReviewOperationStoreRecordSchema.parse({
        schemaVersion: 1,
        semanticsVersion: OPERATION_STORE_SEMANTICS,
        operationId: canonicalState.operationId,
        version: 1,
        state: canonicalState,
      });
      return { content: `${JSON.stringify(next)}\n`, result: { version: next.version } };
    });
  }
}
