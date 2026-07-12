/** Closed causal payloads carried by review receipts. */

import {
  arrayAt,
  digestAt,
  enumAt,
  exactKeys,
  objectAt,
  stringAt,
  timestampAt,
} from "./validation.js";

/** Transport category required to initiate a request. */
export type RequestMechanism = "automatic" | "user-trigger" | "authorized-command" | "attestation";

/** Reservation and the pending projection that must precede an effect. */
export interface ReservationPayload {
  kind: "reservation";
  reservedAt: string | null;
  pendingProjectionRef: string | null;
}

/** Exact owned trigger retained with a provider acknowledgement. */
export interface TriggerIdentity {
  mechanism: RequestMechanism;
  eventKind: "comment" | "label";
  eventId: string;
  actorIdentity: string;
  occurredAt: string | null;
  headSha: string;
  contentDigest: string;
}

/** Provider acknowledgement and its causal trigger. */
export interface AcknowledgementPayload {
  kind: "acknowledgement";
  acknowledgedAt: string | null;
  acknowledgementRef: string;
  trigger: TriggerIdentity;
}

/** Terminal provider evidence references for one request generation. */
export interface TerminalEvidencePayload {
  kind: "terminal-evidence";
  terminalAt: string | null;
  evidenceRefs: string[];
  findingIds: string[];
}

/** Immutable origin of one provider finding. */
export interface FindingOrigin {
  sourceIdentity: string;
  evidenceRef: string;
  headSha: string;
}

/** Settlement state carried with a finding across heads. */
export interface FindingSettlement {
  state: "open" | "fixed" | "deferred" | "rejected" | "provider-closed";
  settledAt: string | null;
  evidenceRef: string | null;
}

/** Finding origin, carried head, and settlement identity. */
export interface FindingLifecyclePayload {
  kind: "finding-lifecycle";
  findingId: string;
  origin: FindingOrigin;
  carriedThroughHeadSha: string;
  settlement: FindingSettlement;
}

/** Unowned event that invalidates one request generation. */
export interface ContaminationPayload {
  kind: "contamination";
  detectedAt: string | null;
  eventRef: string;
  reason: string;
}

/** Explicit retirement of one request generation. */
export interface SupersessionPayload {
  kind: "supersession";
  supersededAt: string | null;
  successorRequestKey: string | null;
  reason: string;
}

/** Explicit provider-side activity or abandonment for one request flight. */
export interface FlightStatePayload {
  kind: "flight-state";
  state: "running" | "abandoned";
  observedAt: string | null;
  evidenceRef: string;
}

/** Single-use authorization to move terminal findings to one exact target head. */
export interface HeadUpdateAuthorizationPayload {
  kind: "head-update-authorization";
  authorizedAt: string;
  terminalRequestKey: string;
  oldHeadSha: string;
  targetHeadSha: string;
  actorIdentity: string;
  findingIds: string[];
}

/** Durable consumption of one exact head-update authorization. */
export interface HeadUpdateConsumptionPayload {
  kind: "head-update-consumption";
  consumedAt: string;
  authorizationReceiptHash: string;
  oldHeadSha: string;
  newHeadSha: string;
  findingIds: string[];
}

/** Authenticated deletion event retained after the canonical comment disappears. */
export interface TriggerDeletedPayload {
  kind: "trigger-deleted";
  commentId: string;
  actorIdentity: string;
  priorBodyDigest: string;
  deletedAt: string;
  observedHeadSha: string;
  providerIdentity: string;
  triggerClassification: "provider-trigger" | "other";
  authenticatedEventRef: string;
}

/** Authorized policy/finding decision with no provider effect. */
export interface DecisionPayload {
  kind: "decision";
  decidedAt: string | null;
}

/** Closed causal receipt payload union. */
export type ReviewReceiptPayload =
  | ReservationPayload
  | AcknowledgementPayload
  | TerminalEvidencePayload
  | FindingLifecyclePayload
  | ContaminationPayload
  | SupersessionPayload
  | FlightStatePayload
  | HeadUpdateAuthorizationPayload
  | HeadUpdateConsumptionPayload
  | TriggerDeletedPayload
  | DecisionPayload;

function nullableAt<T>(value: unknown, path: string, parse: (input: unknown, path: string) => T): T | null {
  return value === null ? null : parse(value, path);
}

function parseTrigger(input: unknown, path: string): TriggerIdentity {
  const record = objectAt(input, path);
  exactKeys(
    record,
    ["mechanism", "eventKind", "eventId", "actorIdentity", "occurredAt", "headSha", "contentDigest"],
    path,
  );
  return {
    mechanism: enumAt(
      record.mechanism,
      ["automatic", "user-trigger", "authorized-command", "attestation"],
      `${path}.mechanism`,
    ),
    eventKind: enumAt(record.eventKind, ["comment", "label"], `${path}.eventKind`),
    eventId: stringAt(record.eventId, `${path}.eventId`),
    actorIdentity: stringAt(record.actorIdentity, `${path}.actorIdentity`),
    occurredAt: nullableAt(record.occurredAt, `${path}.occurredAt`, timestampAt),
    headSha: digestAt(record.headSha, `${path}.headSha`, 40),
    contentDigest: digestAt(record.contentDigest, `${path}.contentDigest`),
  };
}

function parseOrigin(input: unknown, path: string): FindingOrigin {
  const record = objectAt(input, path);
  exactKeys(record, ["sourceIdentity", "evidenceRef", "headSha"], path);
  return {
    sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
    evidenceRef: stringAt(record.evidenceRef, `${path}.evidenceRef`),
    headSha: digestAt(record.headSha, `${path}.headSha`, 40),
  };
}

function parseSettlement(input: unknown, path: string): FindingSettlement {
  const record = objectAt(input, path);
  exactKeys(record, ["state", "settledAt", "evidenceRef"], path);
  const state = enumAt(record.state, ["open", "fixed", "deferred", "rejected", "provider-closed"], `${path}.state`);
  const settledAt = nullableAt(record.settledAt, `${path}.settledAt`, timestampAt);
  const evidenceRef = nullableAt(record.evidenceRef, `${path}.evidenceRef`, stringAt);
  if ((state === "open") !== (settledAt === null && evidenceRef === null)) {
    throw new Error(`${path}: open state and settlement evidence are incongruent`);
  }
  return { state, settledAt, evidenceRef };
}

/** Parse one exact causal payload without defaults. */
export function parseReviewReceiptPayload(input: unknown, path: string): ReviewReceiptPayload {
  const record = objectAt(input, path);
  const kind = enumAt(record.kind, [
    "reservation", "acknowledgement", "terminal-evidence", "finding-lifecycle", "contamination", "supersession",
    "flight-state", "head-update-authorization", "head-update-consumption", "trigger-deleted", "decision",
  ], `${path}.kind`);
  switch (kind) {
    case "reservation":
      exactKeys(record, ["kind", "reservedAt", "pendingProjectionRef"], path);
      return {
        kind,
        reservedAt: nullableAt(record.reservedAt, `${path}.reservedAt`, timestampAt),
        pendingProjectionRef: nullableAt(record.pendingProjectionRef, `${path}.pendingProjectionRef`, stringAt),
      };
    case "acknowledgement":
      exactKeys(record, ["kind", "acknowledgedAt", "acknowledgementRef", "trigger"], path);
      return {
        kind,
        acknowledgedAt: nullableAt(record.acknowledgedAt, `${path}.acknowledgedAt`, timestampAt),
        acknowledgementRef: stringAt(record.acknowledgementRef, `${path}.acknowledgementRef`),
        trigger: parseTrigger(record.trigger, `${path}.trigger`),
      };
    case "terminal-evidence":
      exactKeys(record, ["kind", "terminalAt", "evidenceRefs", "findingIds"], path);
      return {
        kind,
        terminalAt: nullableAt(record.terminalAt, `${path}.terminalAt`, timestampAt),
        evidenceRefs: arrayAt(record.evidenceRefs, `${path}.evidenceRefs`, stringAt),
        findingIds: arrayAt(record.findingIds, `${path}.findingIds`, stringAt),
      };
    case "finding-lifecycle":
      exactKeys(record, ["kind", "findingId", "origin", "carriedThroughHeadSha", "settlement"], path);
      return {
        kind,
        findingId: stringAt(record.findingId, `${path}.findingId`),
        origin: parseOrigin(record.origin, `${path}.origin`),
        carriedThroughHeadSha: digestAt(record.carriedThroughHeadSha, `${path}.carriedThroughHeadSha`, 40),
        settlement: parseSettlement(record.settlement, `${path}.settlement`),
      };
    case "contamination":
      exactKeys(record, ["kind", "detectedAt", "eventRef", "reason"], path);
      return {
        kind,
        detectedAt: nullableAt(record.detectedAt, `${path}.detectedAt`, timestampAt),
        eventRef: stringAt(record.eventRef, `${path}.eventRef`),
        reason: stringAt(record.reason, `${path}.reason`),
      };
    case "supersession":
      exactKeys(record, ["kind", "supersededAt", "successorRequestKey", "reason"], path);
      return {
        kind,
        supersededAt: nullableAt(record.supersededAt, `${path}.supersededAt`, timestampAt),
        successorRequestKey: nullableAt(record.successorRequestKey, `${path}.successorRequestKey`, digestAt),
        reason: stringAt(record.reason, `${path}.reason`),
      };
    case "flight-state":
      exactKeys(record, ["kind", "state", "observedAt", "evidenceRef"], path);
      return {
        kind,
        state: enumAt(record.state, ["running", "abandoned"], `${path}.state`),
        observedAt: nullableAt(record.observedAt, `${path}.observedAt`, timestampAt),
        evidenceRef: stringAt(record.evidenceRef, `${path}.evidenceRef`),
      };
    case "head-update-authorization": {
      exactKeys(record, [
        "kind", "authorizedAt", "terminalRequestKey", "oldHeadSha", "targetHeadSha", "actorIdentity", "findingIds",
      ], path);
      const oldHeadSha = digestAt(record.oldHeadSha, `${path}.oldHeadSha`, 40);
      const targetHeadSha = digestAt(record.targetHeadSha, `${path}.targetHeadSha`, 40);
      if (oldHeadSha === targetHeadSha) throw new Error(`${path}: target head must change`);
      return {
        kind,
        authorizedAt: timestampAt(record.authorizedAt, `${path}.authorizedAt`),
        terminalRequestKey: digestAt(record.terminalRequestKey, `${path}.terminalRequestKey`),
        oldHeadSha,
        targetHeadSha,
        actorIdentity: stringAt(record.actorIdentity, `${path}.actorIdentity`),
        findingIds: arrayAt(record.findingIds, `${path}.findingIds`, stringAt),
      };
    }
    case "head-update-consumption":
      exactKeys(record, [
        "kind", "consumedAt", "authorizationReceiptHash", "oldHeadSha", "newHeadSha", "findingIds",
      ], path);
      return {
        kind,
        consumedAt: timestampAt(record.consumedAt, `${path}.consumedAt`),
        authorizationReceiptHash: digestAt(record.authorizationReceiptHash, `${path}.authorizationReceiptHash`),
        oldHeadSha: digestAt(record.oldHeadSha, `${path}.oldHeadSha`, 40),
        newHeadSha: digestAt(record.newHeadSha, `${path}.newHeadSha`, 40),
        findingIds: arrayAt(record.findingIds, `${path}.findingIds`, stringAt),
      };
    case "trigger-deleted": {
      exactKeys(record, [
        "kind", "commentId", "actorIdentity", "priorBodyDigest", "deletedAt", "observedHeadSha", "providerIdentity",
        "triggerClassification", "authenticatedEventRef",
      ], path);
      const commentId = stringAt(record.commentId, `${path}.commentId`);
      const actorIdentity = stringAt(record.actorIdentity, `${path}.actorIdentity`);
      const providerIdentity = stringAt(record.providerIdentity, `${path}.providerIdentity`);
      const authenticatedEventRef = stringAt(record.authenticatedEventRef, `${path}.authenticatedEventRef`);
      if (commentId.length > 64 || actorIdentity.length > 128 || providerIdentity.length > 128) {
        throw new Error(`${path}: deletion identity exceeds bounds`);
      }
      if (Buffer.byteLength(authenticatedEventRef, "utf8") > 2_048) {
        throw new Error(`${path}.authenticatedEventRef: exceeds bounds`);
      }
      return {
        kind,
        commentId,
        actorIdentity,
        priorBodyDigest: digestAt(record.priorBodyDigest, `${path}.priorBodyDigest`),
        deletedAt: timestampAt(record.deletedAt, `${path}.deletedAt`),
        observedHeadSha: digestAt(record.observedHeadSha, `${path}.observedHeadSha`, 40),
        providerIdentity,
        triggerClassification: enumAt(
          record.triggerClassification,
          ["provider-trigger", "other"],
          `${path}.triggerClassification`,
        ),
        authenticatedEventRef,
      };
    }
    case "decision":
      exactKeys(record, ["kind", "decidedAt"], path);
      return { kind, decidedAt: nullableAt(record.decidedAt, `${path}.decidedAt`, timestampAt) };
  }
}
