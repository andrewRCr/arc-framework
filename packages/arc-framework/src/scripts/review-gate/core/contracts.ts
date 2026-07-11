/** Normalized change, policy, and requirement contracts. */

import {
  arrayAt,
  digestAt,
  enumAt,
  exactKeys,
  integerAt,
  objectAt,
  optionalAt,
  schemaOneAt,
  stringAt,
} from "./validation.js";

/** Exact identity of one change set. */
export interface NormalizedChangeRequest {
  schemaVersion: 1;
  repositoryId: string;
  changeRequestId: string;
  hostRef: string;
  baseRef: string;
  baseSha: string;
  diffBaseSha: string;
  headSha: string;
  changeSetId: string;
}

/** Permission understood by the normalized authorization boundary. */
export type ActorPermission = "read" | "triage" | "write" | "maintain" | "admin";

/** Stable actor identity and its observed permissions. */
export interface CapabilitySet {
  schemaVersion: 1;
  actorIdentity: string;
  permissions: ActorPermission[];
}

/** Kind of review obligation. */
export type RequirementKind = "peer-approval" | "independent-analysis" | "specialist-review";
/** Whether an unmet requirement blocks the verdict. */
export type RequirementObligation = "required" | "recommended";
/** Normalized source family. */
export type SourceKind = "human" | "agent" | "deterministic-tool";
/** Initial request admission mode. */
export type InitialAdmission = "automatic" | "checkpoint";

/** A source family accepted for a requirement. */
export interface AcceptedSource {
  sourceKind: SourceKind;
  qualifier?: string;
}

/** Versioned obligation bound to one exact change set. */
export interface ReviewRequirement {
  schemaVersion: 1;
  id: string;
  kind: RequirementKind;
  obligation: RequirementObligation;
  acceptableSources: AcceptedSource[];
  count: number;
  initialAdmission: InitialAdmission;
  policyVersion: string;
  rubricVersion: string;
  changeSetId: string;
  headSha: string;
}

/** Plain-data requirement template before change-set binding. */
export interface ReviewRequirementTemplate {
  id: string;
  kind: RequirementKind;
  obligation: RequirementObligation;
  acceptableSources: AcceptedSource[];
  count: number;
  initialAdmission: InitialAdmission;
  rubricVersion: string;
}

/** Plain-data review policy document used to calculate policy identity. */
export interface ReviewPolicy {
  schemaVersion: 1;
  semanticsVersion: string;
  requirements: ReviewRequirementTemplate[];
}

/** Validate one exact change request. */
export function parseNormalizedChangeRequest(input: unknown): NormalizedChangeRequest {
  const record = objectAt(input, "changeRequest");
  exactKeys(record, [
    "schemaVersion", "repositoryId", "changeRequestId", "hostRef", "baseRef", "baseSha", "diffBaseSha",
    "headSha", "changeSetId",
  ], "changeRequest");
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, "changeRequest.schemaVersion"),
    repositoryId: stringAt(record.repositoryId, "changeRequest.repositoryId"),
    changeRequestId: stringAt(record.changeRequestId, "changeRequest.changeRequestId"),
    hostRef: stringAt(record.hostRef, "changeRequest.hostRef"),
    baseRef: stringAt(record.baseRef, "changeRequest.baseRef"),
    baseSha: digestAt(record.baseSha, "changeRequest.baseSha", 40),
    diffBaseSha: digestAt(record.diffBaseSha, "changeRequest.diffBaseSha", 40),
    headSha: digestAt(record.headSha, "changeRequest.headSha", 40),
    changeSetId: digestAt(record.changeSetId, "changeRequest.changeSetId"),
  };
}

/** Validate actor capabilities. */
export function parseCapabilitySet(input: unknown): CapabilitySet {
  const record = objectAt(input, "capabilities");
  exactKeys(record, ["schemaVersion", "actorIdentity", "permissions"], "capabilities");
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, "capabilities.schemaVersion"),
    actorIdentity: stringAt(record.actorIdentity, "capabilities.actorIdentity"),
    permissions: arrayAt(record.permissions, "capabilities.permissions", (value, path) =>
      enumAt(value, ["read", "triage", "write", "maintain", "admin"], path)),
  };
}

function parseAcceptedSource(input: unknown, path: string): AcceptedSource {
  const record = objectAt(input, path);
  exactKeys(record, ["sourceKind", "qualifier"], path);
  const qualifier = optionalAt(record.qualifier, `${path}.qualifier`, stringAt);
  return {
    sourceKind: enumAt(record.sourceKind, ["human", "agent", "deterministic-tool"], `${path}.sourceKind`),
    ...(qualifier === undefined ? {} : { qualifier }),
  };
}

/** Validate one review requirement. */
export function parseReviewRequirement(input: unknown, path = "requirement"): ReviewRequirement {
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "id", "kind", "obligation", "acceptableSources", "count", "initialAdmission",
    "policyVersion", "rubricVersion", "changeSetId", "headSha",
  ], path);
  const acceptableSources = arrayAt(record.acceptableSources, `${path}.acceptableSources`, parseAcceptedSource);
  if (acceptableSources.length === 0) throw new Error(`${path}.acceptableSources: expected at least one source`);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    id: stringAt(record.id, `${path}.id`),
    kind: enumAt(record.kind, ["peer-approval", "independent-analysis", "specialist-review"], `${path}.kind`),
    obligation: enumAt(record.obligation, ["required", "recommended"], `${path}.obligation`),
    acceptableSources,
    count: integerAt(record.count, `${path}.count`, 1),
    initialAdmission: enumAt(record.initialAdmission, ["automatic", "checkpoint"], `${path}.initialAdmission`),
    policyVersion: digestAt(record.policyVersion, `${path}.policyVersion`),
    rubricVersion: stringAt(record.rubricVersion, `${path}.rubricVersion`),
    changeSetId: digestAt(record.changeSetId, `${path}.changeSetId`),
    headSha: digestAt(record.headSha, `${path}.headSha`, 40),
  };
}

function parseRequirementTemplate(input: unknown, path: string): ReviewRequirementTemplate {
  const record = objectAt(input, path);
  exactKeys(record, [
    "id", "kind", "obligation", "acceptableSources", "count", "initialAdmission", "rubricVersion",
  ], path);
  const acceptableSources = arrayAt(record.acceptableSources, `${path}.acceptableSources`, parseAcceptedSource);
  if (acceptableSources.length === 0) throw new Error(`${path}.acceptableSources: expected at least one source`);
  return {
    id: stringAt(record.id, `${path}.id`),
    kind: enumAt(record.kind, ["peer-approval", "independent-analysis", "specialist-review"], `${path}.kind`),
    obligation: enumAt(record.obligation, ["required", "recommended"], `${path}.obligation`),
    acceptableSources,
    count: integerAt(record.count, `${path}.count`, 1),
    initialAdmission: enumAt(record.initialAdmission, ["automatic", "checkpoint"], `${path}.initialAdmission`),
    rubricVersion: stringAt(record.rubricVersion, `${path}.rubricVersion`),
  };
}

/** Validate a plain-data review policy. */
export function parseReviewPolicy(input: unknown): ReviewPolicy {
  const record = objectAt(input, "policy");
  exactKeys(record, ["schemaVersion", "semanticsVersion", "requirements"], "policy");
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, "policy.schemaVersion"),
    semanticsVersion: stringAt(record.semanticsVersion, "policy.semanticsVersion"),
    requirements: arrayAt(record.requirements, "policy.requirements", parseRequirementTemplate),
  };
}
