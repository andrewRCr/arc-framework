/** Closed causal payloads carried by review receipts. */

import {
  arrayAt,
  digestAt,
  enumAt,
  exactKeys,
  integerAt,
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

/** Durable proof that one provider source may yield to a named alternate. */
export interface SourceSupersessionPayload {
  kind: "source-supersession";
  supersededAt: string;
  priorRequestKey: string;
  priorSourceIdentity: string;
  priorGeneration: number;
  proofKind: "capacity-exhausted" | "pre-effect-rejection" | "terminal-failure" | "explicit-repair";
  proofRef: string;
  alternateSourceIdentity: string;
  actorIdentity: string;
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

/** Authority-bearing disposition recorded before any thread resolution. */
export interface FindingDispositionPayload {
  kind: "finding-disposition";
  disposition: "fixed" | "deferred" | "rejected" | "provider-closed";
  findingId: string;
  sourceIdentity: string;
  oldHeadSha: string;
  fixHeadSha: string | null;
  actorIdentity: string;
  rationale: string | null;
  directReplyRef: string | null;
  followUpEvidenceRef: string | null;
  verificationRefs: string[];
  settledAt: string;
}

/** Canonical host observation that follows one durable disposition. */
export interface ConversationResolvedPayload {
  kind: "conversation-resolved";
  findingId: string;
  sourceIdentity: string;
  headSha: string;
  threadId: string;
  resolvedByActorIdentity: string;
  dispositionReceiptHash: string;
  hostEvidenceRef: string;
  resolvedAt: string;
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
  | SourceSupersessionPayload
  | FlightStatePayload
  | HeadUpdateAuthorizationPayload
  | HeadUpdateConsumptionPayload
  | TriggerDeletedPayload
  | FindingDispositionPayload
  | ConversationResolvedPayload
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
    "source-supersession", "flight-state", "head-update-authorization", "head-update-consumption", "trigger-deleted",
    "finding-disposition", "conversation-resolved", "decision",
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
    case "source-supersession":
      exactKeys(record, [
        "kind", "supersededAt", "priorRequestKey", "priorSourceIdentity", "priorGeneration", "proofKind",
        "proofRef", "alternateSourceIdentity", "actorIdentity", "reason",
      ], path);
      return {
        kind,
        supersededAt: timestampAt(record.supersededAt, `${path}.supersededAt`),
        priorRequestKey: digestAt(record.priorRequestKey, `${path}.priorRequestKey`),
        priorSourceIdentity: stringAt(record.priorSourceIdentity, `${path}.priorSourceIdentity`),
        priorGeneration: integerAt(record.priorGeneration, `${path}.priorGeneration`),
        proofKind: enumAt(
          record.proofKind,
          ["capacity-exhausted", "pre-effect-rejection", "terminal-failure", "explicit-repair"],
          `${path}.proofKind`,
        ),
        proofRef: stringAt(record.proofRef, `${path}.proofRef`),
        alternateSourceIdentity: stringAt(record.alternateSourceIdentity, `${path}.alternateSourceIdentity`),
        actorIdentity: stringAt(record.actorIdentity, `${path}.actorIdentity`),
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
    case "finding-disposition": {
      exactKeys(record, [
        "kind", "disposition", "findingId", "sourceIdentity", "oldHeadSha", "fixHeadSha", "actorIdentity",
        "rationale", "directReplyRef", "followUpEvidenceRef", "verificationRefs", "settledAt",
      ], path);
      const disposition = enumAt(
        record.disposition,
        ["fixed", "deferred", "rejected", "provider-closed"],
        `${path}.disposition`,
      );
      const oldHeadSha = digestAt(record.oldHeadSha, `${path}.oldHeadSha`, 40);
      const fixHeadSha = nullableAt(record.fixHeadSha, `${path}.fixHeadSha`, (value, itemPath) =>
        digestAt(value, itemPath, 40));
      const rationale = nullableAt(record.rationale, `${path}.rationale`, stringAt);
      const directReplyRef = nullableAt(record.directReplyRef, `${path}.directReplyRef`, stringAt);
      const followUpEvidenceRef = nullableAt(record.followUpEvidenceRef, `${path}.followUpEvidenceRef`, stringAt);
      const verificationRefs = arrayAt(record.verificationRefs, `${path}.verificationRefs`, stringAt);
      if (disposition === "fixed") {
        if (fixHeadSha === null || fixHeadSha === oldHeadSha || directReplyRef === null
          || followUpEvidenceRef === null || verificationRefs.length === 0 || rationale !== null) {
          throw new Error(`${path}: invalid fixed disposition`);
        }
      } else if (disposition === "deferred" || disposition === "rejected") {
        if (fixHeadSha !== null || rationale === null || rationale.length === 0 || rationale.length > 1024
          || directReplyRef === null || followUpEvidenceRef !== null || verificationRefs.length > 0) {
          throw new Error(`${path}: invalid non-fix disposition`);
        }
      } else if (fixHeadSha !== null || rationale !== null || directReplyRef !== null
        || followUpEvidenceRef === null || verificationRefs.length > 0) {
        throw new Error(`${path}: invalid provider closure`);
      }
      return {
        kind,
        disposition,
        findingId: stringAt(record.findingId, `${path}.findingId`),
        sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
        oldHeadSha,
        fixHeadSha,
        actorIdentity: stringAt(record.actorIdentity, `${path}.actorIdentity`),
        rationale,
        directReplyRef,
        followUpEvidenceRef,
        verificationRefs,
        settledAt: timestampAt(record.settledAt, `${path}.settledAt`),
      };
    }
    case "conversation-resolved":
      exactKeys(record, [
        "kind", "findingId", "sourceIdentity", "headSha", "threadId", "resolvedByActorIdentity",
        "dispositionReceiptHash", "hostEvidenceRef", "resolvedAt",
      ], path);
      return {
        kind,
        findingId: stringAt(record.findingId, `${path}.findingId`),
        sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
        headSha: digestAt(record.headSha, `${path}.headSha`, 40),
        threadId: stringAt(record.threadId, `${path}.threadId`),
        resolvedByActorIdentity: stringAt(record.resolvedByActorIdentity, `${path}.resolvedByActorIdentity`),
        dispositionReceiptHash: digestAt(record.dispositionReceiptHash, `${path}.dispositionReceiptHash`),
        hostEvidenceRef: stringAt(record.hostEvidenceRef, `${path}.hostEvidenceRef`),
        resolvedAt: timestampAt(record.resolvedAt, `${path}.resolvedAt`),
      };
    case "decision":
      exactKeys(record, ["kind", "decidedAt"], path);
      return { kind, decidedAt: nullableAt(record.decidedAt, `${path}.decidedAt`, timestampAt) };
  }
}
