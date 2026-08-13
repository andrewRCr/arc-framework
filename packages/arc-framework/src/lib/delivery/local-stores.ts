/** Git-common-directory adapters for delivery plan and mutable execution records. */

import type { GitCommonStateLocation, GitCommonStatePublisher } from "../git-common-state.js";
import {
  canonicalize,
  SlugSchema,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../kernel/index.js";
import type {
  DeliveryMemberSelector,
  DeliveryOwningUnitPointer,
  DeliveryPayloadCodec,
  DeliveryPlanPayloadCodec,
  DeliveryPlanStore,
  DeliveryPlanStoreFailure,
  DeliveryRevisionedRecord,
  DeliveryStateMemberResolution,
  DeliveryStateStore,
  DeliveryStateStoreFailure,
  DeliveryStoreResult,
} from "./ports.js";
import { DeliveryPlanIdSchema, type DeliveryStateV1 } from "./schema.js";
import { DeliveryStateV1Codec } from "./state.js";

const PLAN_LOCATION = { root: "delivery", namespace: "plans" } as const;
const STATE_LOCATION = { root: "delivery", namespace: "state" } as const;
const STATE_SEMANTICS = "delivery-state-store/v1";

function stateMemberMatches(
  member: DeliveryStateV1["members"][number],
  selector: DeliveryMemberSelector,
): boolean {
  if (member.coordinates === null) return false;
  if (selector.kind === "head") return member.coordinates.head === selector.objectId;
  return member.ref === selector.ref
    && member.coordinates.head === selector.observedHeadObjectId;
}

function matchingStateMembers(
  state: DeliveryStateV1,
  selector: DeliveryMemberSelector,
): readonly DeliveryStateMemberResolution<DeliveryStateV1>[] {
  return state.members
    .filter((member) => stateMemberMatches(member, selector))
    .map((member) => ({
      planId: state.planId,
      deliverableId: member.deliverableId as CanonicalDigest,
      workUnitId: state.workUnitId,
      state,
    }));
}

function planRecordName(planId: string): string {
  return `${planId}.json`;
}

function normalizePlanId(planId: string): string | null {
  const parsed = DeliveryPlanIdSchema.safeParse(planId);
  return parsed.success ? parsed.data : null;
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
  const addressedPlanId = normalizePlanId(planId);
  if (addressedPlanId === null) return { status: "refused", reason: "identity-mismatch" };
  const raw = await publisher.read(location, planRecordName(addressedPlanId));
  if (raw === null) return { status: "ok", value: null };
  return decodeRevisionedRecord(raw, addressedPlanId, semanticsVersion, codec);
}

async function publishRevisionedRecord<T>(
  publisher: GitCommonStatePublisher,
  location: GitCommonStateLocation,
  semanticsVersion: string,
  codec: DeliveryPayloadCodec<T>,
  planId: string,
  value: T,
  expectedRevision: number,
  isSuccessor?: (current: T, proposed: T) => boolean,
): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<T>, RevisionStoreFailure>> {
  const addressedPlanId = normalizePlanId(planId);
  if (addressedPlanId === null) return { status: "refused", reason: "identity-mismatch" };
  const proposed = codec.decode(value);
  if (proposed.status === "refused") return { status: "refused", reason: "record-malformed" };
  if (codec.planId(proposed.value) !== addressedPlanId) {
    return { status: "refused", reason: "identity-mismatch" };
  }
  return publisher.update<DeliveryStoreResult<DeliveryRevisionedRecord<T>, RevisionStoreFailure>>(
    location,
    planRecordName(addressedPlanId),
    (raw) => {
      let current: DeliveryRevisionedRecord<T> | null = null;
      if (raw !== null) {
        const decoded = decodeRevisionedRecord(raw, addressedPlanId, semanticsVersion, codec);
        if (decoded.status === "refused") return { kind: "keep", result: decoded };
        current = decoded.value;
        if (canonicalize(current.value) === canonicalize(proposed.value)) {
          return { kind: "keep", result: { status: "ok", value: current } };
        }
      }
      const currentRevision = current?.revision ?? 0;
    if (currentRevision !== expectedRevision) {
      return { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
    }
    if (current !== null && isSuccessor !== undefined && !isSuccessor(current.value, proposed.value)) {
      return { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
    }
      const next: RevisionedEnvelope<T> = {
        schemaVersion: 1,
        semanticsVersion,
        planId: addressedPlanId,
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

async function restoreExactRevisionedRecord<T>(
  publisher: GitCommonStatePublisher,
  location: GitCommonStateLocation,
  semanticsVersion: string,
  codec: DeliveryPayloadCodec<T>,
  planId: string,
  record: DeliveryRevisionedRecord<T>,
): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<T>, RevisionStoreFailure>> {
  const addressedPlanId = normalizePlanId(planId);
  if (addressedPlanId === null) return { status: "refused", reason: "identity-mismatch" };
  if (!Number.isSafeInteger(record.revision) || record.revision <= 0) {
    return { status: "refused", reason: "record-malformed" };
  }
  const proposed = codec.decode(record.value);
  if (proposed.status === "refused") return { status: "refused", reason: "record-malformed" };
  if (codec.planId(proposed.value) !== addressedPlanId) {
    return { status: "refused", reason: "identity-mismatch" };
  }
  const restored = { revision: record.revision, value: proposed.value };
  return publisher.update<DeliveryStoreResult<DeliveryRevisionedRecord<T>, RevisionStoreFailure>>(
    location,
    planRecordName(addressedPlanId),
    (raw) => {
      if (raw !== null) {
        const current = decodeRevisionedRecord(raw, addressedPlanId, semanticsVersion, codec);
        if (current.status === "refused") return { kind: "keep", result: current };
        return canonicalize(current.value) === canonicalize(restored)
          ? { kind: "keep", result: { status: "ok", value: current.value } }
          : { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
      }
      const envelope: RevisionedEnvelope<T> = {
        schemaVersion: 1,
        semanticsVersion,
        planId: addressedPlanId,
        revision: restored.revision,
        value: restored.value,
      };
      return {
        kind: "write",
        content: serialize(envelope),
        result: { status: "ok", value: restored },
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
    const addressedPlanId = normalizePlanId(planId);
    if (addressedPlanId === null) return { status: "refused", reason: "identity-mismatch" };
    const raw = await this.publisher.read(PLAN_LOCATION, planRecordName(addressedPlanId));
    if (raw === null) return { status: "ok", value: null };
    return decodeRecord(raw, addressedPlanId, this.codec);
  }

  async publishCurrent(
    planId: string,
    plan: TPlan,
    expectedCurrentDigest: CanonicalDigest | null,
  ): Promise<DeliveryStoreResult<{ readonly currentDigest: CanonicalDigest }, DeliveryPlanStoreFailure>> {
    const addressedPlanId = normalizePlanId(planId);
    if (addressedPlanId === null) return { status: "refused", reason: "identity-mismatch" };
    const proposed = this.codec.decode(plan);
    if (proposed.status === "refused") return { status: "refused", reason: "record-malformed" };
    if (this.codec.planId(proposed.value) !== addressedPlanId) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    const content = serialize(proposed.value);
    const proposedDigest = this.codec.digest(proposed.value);
    return this.publisher.update<DeliveryStoreResult<
      { readonly currentDigest: CanonicalDigest },
      DeliveryPlanStoreFailure
    >>(PLAN_LOCATION, planRecordName(addressedPlanId), (raw) => {
      if (raw === content) {
        return { kind: "keep", result: { status: "ok", value: { currentDigest: proposedDigest } } };
      }
      if (raw === null) {
        if (expectedCurrentDigest !== null) {
          return { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
        }
        if (!this.codec.isValidSuccessor(null, proposed.value)) {
          return { kind: "keep", result: { status: "refused", reason: "record-malformed" } };
        }
        return {
          kind: "write",
          content,
          result: { status: "ok", value: { currentDigest: proposedDigest } },
        };
      }
      const current = decodeRecord(raw, addressedPlanId, this.codec);
      if (current.status === "refused") return { kind: "keep", result: current };
      if (this.codec.digest(current.value) !== expectedCurrentDigest) {
        return { kind: "keep", result: { status: "refused", reason: "version-conflict" } };
      }
      if (!this.codec.isValidSuccessor(current.value, proposed.value)) {
        return { kind: "keep", result: { status: "refused", reason: "record-malformed" } };
      }
      return {
        kind: "write",
        content,
        result: { status: "ok", value: { currentDigest: proposedDigest } },
      };
    });
  }

  async enumerateCurrent(): Promise<DeliveryStoreResult<readonly TPlan[], DeliveryPlanStoreFailure>> {
    const entries = await this.publisher.snapshot(PLAN_LOCATION);
    const plansById = new Map<string, TPlan>();
    for (const entry of entries) {
      if (entry.kind !== "file" || !/^[a-z0-9][a-z0-9.-]*\.json$/u.test(entry.name)) {
        return { status: "refused", reason: "namespace-corrupt" };
      }
      const planId = entry.name.slice(0, -".json".length);
      const current = decodeRecord(entry.content, planId, this.codec);
      if (current.status === "refused") return current;
      if (plansById.has(planId)) {
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

/** Repository-common revision-checked delivery-state adapter. */
export class RepositoryDeliveryStateStore implements DeliveryStateStore<DeliveryStateV1> {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  /** Restore one exact generation without overwriting different local state. */
  async restoreExact(
    planId: string,
    record: DeliveryRevisionedRecord<DeliveryStateV1>,
  ): Promise<DeliveryStoreResult<
    DeliveryRevisionedRecord<DeliveryStateV1>,
    DeliveryStateStoreFailure
  >> {
    return restoreExactRevisionedRecord(
      this.publisher,
      STATE_LOCATION,
      STATE_SEMANTICS,
      DeliveryStateV1Codec,
      planId,
      record,
    );
  }

  async read(
    planId: string,
  ): Promise<DeliveryStoreResult<
    DeliveryRevisionedRecord<DeliveryStateV1> | null,
    DeliveryStateStoreFailure
  >> {
    return readRevisionedRecord(
      this.publisher,
      STATE_LOCATION,
      STATE_SEMANTICS,
      DeliveryStateV1Codec,
      planId,
    );
  }

  async publish(
    planId: string,
    value: DeliveryStateV1,
    expectedRevision: number,
  ): Promise<DeliveryStoreResult<
    DeliveryRevisionedRecord<DeliveryStateV1>,
    DeliveryStateStoreFailure
  >> {
    return publishRevisionedRecord(
      this.publisher,
      STATE_LOCATION,
      STATE_SEMANTICS,
      DeliveryStateV1Codec,
      planId,
      value,
      expectedRevision,
    );
  }

  async resolveMember(input: {
    readonly selector: DeliveryMemberSelector;
    readonly owningUnit?: DeliveryOwningUnitPointer;
  }): Promise<DeliveryStoreResult<
    DeliveryStateMemberResolution<DeliveryStateV1> | null,
    DeliveryStateStoreFailure
  >> {
    if (input.owningUnit !== undefined
      && (normalizePlanId(input.owningUnit.planId) === null
        || !SlugSchema.safeParse(input.owningUnit.workUnitId).success)) {
      return { status: "refused", reason: "identity-mismatch" };
    }

    const entries = await this.publisher.snapshot(STATE_LOCATION);
    const matches: DeliveryStateMemberResolution<DeliveryStateV1>[] = [];
    for (const entry of entries) {
      const rawPlanId = entry.name.endsWith(".json")
        ? entry.name.slice(0, -".json".length)
        : "";
      const parsedPlanId = DeliveryPlanIdSchema.safeParse(rawPlanId);
      if (entry.kind !== "file" || !parsedPlanId.success || parsedPlanId.data !== rawPlanId) {
        return { status: "refused", reason: "namespace-corrupt" };
      }
      const candidate = decodeRevisionedRecord(
        entry.content,
        rawPlanId,
        STATE_SEMANTICS,
        DeliveryStateV1Codec,
      );
      if (candidate.status === "refused") return candidate;
      matches.push(...matchingStateMembers(candidate.value.value, input.selector));
    }
    if (matches.length > 1) return { status: "refused", reason: "ambiguous-match" };
    const match = matches[0] ?? null;
    if (match !== null && input.owningUnit !== undefined
      && (match.planId !== normalizePlanId(input.owningUnit.planId)
        || match.workUnitId !== input.owningUnit.workUnitId)) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    return { status: "ok", value: match };
  }
}
