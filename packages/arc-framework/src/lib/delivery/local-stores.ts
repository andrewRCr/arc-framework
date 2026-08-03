/** Git-common-directory adapters for current delivery plan, assignment, and observation records. */

import type { GitCommonStateLocation, GitCommonStatePublisher } from "../git-common-state.js";
import { sortByCanonicalBytes, type CanonicalDigest } from "../kernel/index.js";
import type {
  DeliveryAssignmentStore,
  DeliveryAssignmentStoreFailure,
  DeliveryObservationStore,
  DeliveryObservationStoreFailure,
  DeliveryPayloadCodec,
  DeliveryPlanPayloadCodec,
  DeliveryPlanStore,
  DeliveryPlanStoreFailure,
  DeliveryRevisionedRecord,
  DeliveryStoreResult,
} from "./ports.js";

const PLAN_LOCATION = { root: "delivery", namespace: "plans" } as const;
const ASSIGNMENT_LOCATION = { root: "delivery", namespace: "assignments" } as const;
const OBSERVATION_LOCATION = { root: "delivery", namespace: "observations" } as const;
const ASSIGNMENT_SEMANTICS = "delivery-assignment-store/v1";
const OBSERVATION_SEMANTICS = "delivery-observation-store/v1";

function planRecordName(planId: string): string {
  return `${planId}.json`;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function decodeRecord<T>(
  raw: string,
  addressedPlanId: string,
  codec: DeliveryPayloadCodec<T>,
): DeliveryStoreResult<T, "record-malformed" | "identity-mismatch"> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "refused", reason: "record-malformed" };
  }
  const decoded = codec.decode(value);
  if (decoded.status === "refused") return { status: "refused", reason: "record-malformed" };
  if (codec.planId(decoded.value) !== addressedPlanId) {
    return { status: "refused", reason: "identity-mismatch" };
  }
  return { status: "ok", value: decoded.value };
}

interface RevisionedEnvelope<T> {
  readonly schemaVersion: 1;
  readonly semanticsVersion: string;
  readonly planId: string;
  readonly revision: number;
  readonly value: T;
}

type RevisionStoreFailure = "record-malformed" | "identity-mismatch" | "version-conflict";

function decodeRevisionedRecord<T>(
  raw: string,
  addressedPlanId: string,
  semanticsVersion: string,
  codec: DeliveryPayloadCodec<T>,
): DeliveryStoreResult<DeliveryRevisionedRecord<T>, "record-malformed" | "identity-mismatch"> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "refused", reason: "record-malformed" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { status: "refused", reason: "record-malformed" };
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = ["planId", "revision", "schemaVersion", "semanticsVersion", "value"];
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys)
    || record["schemaVersion"] !== 1
    || record["semanticsVersion"] !== semanticsVersion
    || typeof record["planId"] !== "string"
    || !Number.isSafeInteger(record["revision"])
    || (record["revision"] as number) <= 0) {
    return { status: "refused", reason: "record-malformed" };
  }
  const decoded = codec.decode(record["value"]);
  if (decoded.status === "refused") return { status: "refused", reason: "record-malformed" };
  if (record["planId"] !== addressedPlanId || codec.planId(decoded.value) !== addressedPlanId) {
    return { status: "refused", reason: "identity-mismatch" };
  }
  return {
    status: "ok",
    value: { revision: record["revision"] as number, value: decoded.value },
  };
}

async function readRevisionedRecord<T>(
  publisher: GitCommonStatePublisher,
  location: GitCommonStateLocation,
  semanticsVersion: string,
  codec: DeliveryPayloadCodec<T>,
  planId: string,
): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<T> | null, RevisionStoreFailure>> {
  const raw = await publisher.read(location, planRecordName(planId));
  if (raw === null) return { status: "ok", value: null };
  return decodeRevisionedRecord(raw, planId, semanticsVersion, codec);
}

async function publishRevisionedRecord<T>(
  publisher: GitCommonStatePublisher,
  location: GitCommonStateLocation,
  semanticsVersion: string,
  codec: DeliveryPayloadCodec<T>,
  planId: string,
  value: T,
  expectedRevision: number,
): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<T>, RevisionStoreFailure>> {
  const proposed = codec.decode(value);
  if (proposed.status === "refused") return { status: "refused", reason: "record-malformed" };
  if (codec.planId(proposed.value) !== planId) {
    return { status: "refused", reason: "identity-mismatch" };
  }
  return publisher.update<DeliveryStoreResult<DeliveryRevisionedRecord<T>, RevisionStoreFailure>>(
    location,
    planRecordName(planId),
    (raw) => {
      let current: DeliveryRevisionedRecord<T> | null = null;
      if (raw !== null) {
        const decoded = decodeRevisionedRecord(raw, planId, semanticsVersion, codec);
        if (decoded.status === "refused") return { kind: "keep", result: decoded };
        current = decoded.value;
        if (serialize(current.value) === serialize(proposed.value)) {
          return { kind: "keep", result: { status: "ok", value: current } };
        }
      }
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        return { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
      }
      const next: RevisionedEnvelope<T> = {
        schemaVersion: 1,
        semanticsVersion,
        planId,
        revision: currentRevision + 1,
        value: proposed.value,
      };
      return {
        kind: "write",
        content: serialize(next),
        result: { status: "ok", value: { revision: next.revision, value: next.value } },
      };
    },
  );
}

/** Repository-common immutable-current plan adapter. */
export class RepositoryDeliveryPlanStore<TPlan> implements DeliveryPlanStore<TPlan> {
  constructor(
    private readonly publisher: GitCommonStatePublisher,
    private readonly codec: DeliveryPlanPayloadCodec<TPlan>,
  ) {}

  async readCurrent(
    planId: string,
  ): Promise<DeliveryStoreResult<TPlan | null, DeliveryPlanStoreFailure>> {
    const raw = await this.publisher.read(PLAN_LOCATION, planRecordName(planId));
    if (raw === null) return { status: "ok", value: null };
    return decodeRecord(raw, planId, this.codec);
  }

  async publishCurrent(
    planId: string,
    plan: TPlan,
    expectedCurrentDigest: CanonicalDigest | null,
  ): Promise<DeliveryStoreResult<{ readonly currentDigest: CanonicalDigest }, DeliveryPlanStoreFailure>> {
    const proposed = this.codec.decode(plan);
    if (proposed.status === "refused") return { status: "refused", reason: "record-malformed" };
    if (this.codec.planId(proposed.value) !== planId) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    const content = serialize(proposed.value);
    const proposedDigest = this.codec.digest(proposed.value);
    return this.publisher.update<DeliveryStoreResult<
      { readonly currentDigest: CanonicalDigest },
      DeliveryPlanStoreFailure
    >>(PLAN_LOCATION, planRecordName(planId), (raw) => {
      if (raw === content) {
        return { kind: "keep", result: { status: "ok", value: { currentDigest: proposedDigest } } };
      }
      if (raw === null) {
        if (expectedCurrentDigest !== null) {
          return { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
        }
        return {
          kind: "write",
          content,
          result: { status: "ok", value: { currentDigest: proposedDigest } },
        };
      }
      const current = decodeRecord(raw, planId, this.codec);
      if (current.status === "refused") return { kind: "keep", result: current };
      if (this.codec.digest(current.value) !== expectedCurrentDigest) {
        return { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
      }
      return {
        kind: "write",
        content,
        result: { status: "ok", value: { currentDigest: proposedDigest } },
      };
    });
  }

  async enumerateCurrent(): Promise<DeliveryStoreResult<readonly TPlan[], DeliveryPlanStoreFailure>> {
    const entries = await this.publisher.list(PLAN_LOCATION);
    const plansById = new Map<string, TPlan>();
    for (const entry of entries) {
      if (entry.kind !== "file" || !/^[a-z0-9][a-z0-9.-]*\.json$/u.test(entry.name)) {
        return { status: "refused", reason: "namespace-corrupt" };
      }
      const planId = entry.name.slice(0, -".json".length);
      const current = await this.readCurrent(planId);
      if (current.status === "refused") return current;
      if (current.value === null || plansById.has(planId)) {
        return { status: "refused", reason: "namespace-corrupt" };
      }
      plansById.set(planId, current.value);
    }
    const planIds = sortByCanonicalBytes([...plansById.keys()]);
    return {
      status: "ok",
      value: planIds.flatMap((planId) => {
        const plan = plansById.get(planId);
        return plan === undefined ? [] : [plan];
      }),
    };
  }
}

/** Repository-common revision-checked assignment adapter. */
export class RepositoryDeliveryAssignmentStore<TAssignment>
implements Pick<DeliveryAssignmentStore<TAssignment>, "read" | "publish"> {
  constructor(
    private readonly publisher: GitCommonStatePublisher,
    private readonly codec: DeliveryPayloadCodec<TAssignment>,
  ) {}

  async read(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TAssignment> | null, DeliveryAssignmentStoreFailure>> {
    return readRevisionedRecord(
      this.publisher,
      ASSIGNMENT_LOCATION,
      ASSIGNMENT_SEMANTICS,
      this.codec,
      planId,
    );
  }

  async publish(
    planId: string,
    value: TAssignment,
    expectedRevision: number,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TAssignment>, DeliveryAssignmentStoreFailure>> {
    return publishRevisionedRecord(
      this.publisher,
      ASSIGNMENT_LOCATION,
      ASSIGNMENT_SEMANTICS,
      this.codec,
      planId,
      value,
      expectedRevision,
    );
  }
}

/** Repository-common revision-checked observation adapter. */
export class RepositoryDeliveryObservationStore<TObservation> implements DeliveryObservationStore<TObservation> {
  constructor(
    private readonly publisher: GitCommonStatePublisher,
    private readonly codec: DeliveryPayloadCodec<TObservation>,
  ) {}

  async read(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TObservation> | null, DeliveryObservationStoreFailure>> {
    return readRevisionedRecord(
      this.publisher,
      OBSERVATION_LOCATION,
      OBSERVATION_SEMANTICS,
      this.codec,
      planId,
    );
  }

  async publish(
    planId: string,
    value: TObservation,
    expectedRevision: number,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TObservation>, DeliveryObservationStoreFailure>> {
    return publishRevisionedRecord(
      this.publisher,
      OBSERVATION_LOCATION,
      OBSERVATION_SEMANTICS,
      this.codec,
      planId,
      value,
      expectedRevision,
    );
  }
}
