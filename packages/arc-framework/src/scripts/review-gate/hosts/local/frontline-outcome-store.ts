/** Repository-shared persistence for durable frontline advisory outcomes. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  FrontlineOutcomeRecordSchema,
  type FrontlineOutcomeRecord,
} from "../../core/advisory-records.js";
import type { FrontlineOutcomeStore } from "../../core/ports.js";
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";

import { OUTCOME_STORE_SEMANTICS, FrontlineOutcomeStoreRecordSchema, type FrontlineOutcomeStoreRecord } from "../../core/repository-record-schemas.js";

/** Stable local-store failure that callers can handle without parsing prose. */
export class LocalFrontlineOutcomeStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "LocalFrontlineOutcomeStoreError";
  }
}

function recordName(operationId: string): string {
  const digest = canonicalDigest({ operationId }).slice("sha256:".length);
  return `frontline-outcome-${digest}.json`;
}

function outcomeRef(name: string, version: number): string {
  return `git-common:review-gate/outcomes/${name}#${version}`;
}

function parseRecord(raw: string, operationId: string): FrontlineOutcomeStoreRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LocalFrontlineOutcomeStoreError("malformed-frontline-outcome");
  }
  const parsed = FrontlineOutcomeStoreRecordSchema.safeParse(value);
  if (!parsed.success) throw new LocalFrontlineOutcomeStoreError("malformed-frontline-outcome");
  if (parsed.data.operationId !== operationId || parsed.data.record.operationId !== operationId) {
    throw new LocalFrontlineOutcomeStoreError("operation-id-mismatch");
  }
  return parsed.data;
}

/** Version-checked append-only frontline outcomes backed by repository-common storage. */
export class LocalFrontlineOutcomeStore implements FrontlineOutcomeStore {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async readOutcome(operationId: string): Promise<{
    version: number;
    record: FrontlineOutcomeRecord | null;
    outcomeRef: string | null;
  }> {
    const name = recordName(operationId);
    const raw = await this.publisher.read({ root: "review-gate", namespace: "outcomes" }, name);
    if (raw === null) return { version: 0, record: null, outcomeRef: null };
    const stored = parseRecord(raw, operationId);
    return {
      version: stored.version,
      record: stored.record,
      outcomeRef: outcomeRef(name, stored.version),
    };
  }

  async appendOutcome(
    record: FrontlineOutcomeRecord,
    expectedVersion: number,
  ): Promise<{ version: number; outcomeRef: string }> {
    const canonicalRecord = FrontlineOutcomeRecordSchema.parse(record);
    const name = recordName(canonicalRecord.operationId);
    return this.publisher.update({ root: "review-gate", namespace: "outcomes" }, name, (raw) => {
      if (raw !== null) {
        const current = parseRecord(raw, canonicalRecord.operationId);
        if (canonicalize(current.record) !== canonicalize(canonicalRecord)) {
          throw new LocalFrontlineOutcomeStoreError("conflicting-replay");
        }
        return {
          kind: "keep",
          result: {
            version: current.version,
            outcomeRef: outcomeRef(name, current.version),
          },
        };
      }
      if (expectedVersion !== 0) throw new LocalFrontlineOutcomeStoreError("version-conflict");
      const stored = FrontlineOutcomeStoreRecordSchema.parse({
        schemaVersion: 1,
        semanticsVersion: OUTCOME_STORE_SEMANTICS,
        operationId: canonicalRecord.operationId,
        version: 1,
        record: canonicalRecord,
      });
      return {
        kind: "write",
        content: `${JSON.stringify(stored)}\n`,
        result: {
          version: stored.version,
          outcomeRef: outcomeRef(name, stored.version),
        },
      };
    });
  }
}
