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

/** Permissions understood by the normalized authorization boundary, in ascending authority order. */
export const ACTOR_PERMISSIONS = ["read", "triage", "write", "maintain", "admin"] as const;
/** Member of the closed normalized permission set. */
export type ActorPermission = (typeof ACTOR_PERMISSIONS)[number];
/** Numeric authority rank for normalized permissions. */
export const ACTOR_PERMISSION_RANK: Record<ActorPermission, number> = {
  read: 0,
  triage: 1,
  write: 2,
  maintain: 3,
  admin: 4,
};

/** Check whether one normalized permission meets a minimum authority level. */
export function meetsMinimumPermission(permission: ActorPermission, minimum: ActorPermission): boolean {
  return ACTOR_PERMISSION_RANK[permission] >= ACTOR_PERMISSION_RANK[minimum];
}

/** Stable actor identity and its observed permissions. */
export interface CapabilitySet {
  schemaVersion: 1;
  actorIdentity: string;
  permissions: ActorPermission[];
}

/** Kinds of review obligation. */
export const REQUIREMENT_KINDS = ["peer-approval", "independent-analysis", "specialist-review"] as const;
/** Member of the closed review-obligation kind set. */
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];
/** Requirement obligation levels. */
export const REQUIREMENT_OBLIGATIONS = ["required", "recommended"] as const;
/** Member of the closed requirement-obligation set. */
export type RequirementObligation = (typeof REQUIREMENT_OBLIGATIONS)[number];
/** Normalized source family. */
export const SOURCE_KINDS = ["human", "agent", "deterministic-tool"] as const;
/** Member of the closed normalized source-family set. */
export type SourceKind = (typeof SOURCE_KINDS)[number];
/** Initial request admission modes. */
export const INITIAL_ADMISSIONS = ["automatic", "checkpoint"] as const;
/** Member of the closed initial-admission set. */
export type InitialAdmission = (typeof INITIAL_ADMISSIONS)[number];

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
  reasons: string[];
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
      enumAt(value, ACTOR_PERMISSIONS, path)),
  };
}

function parseAcceptedSource(input: unknown, path: string): AcceptedSource {
  const record = objectAt(input, path);
  exactKeys(record, ["sourceKind", "qualifier"], path);
  const qualifier = optionalAt(record.qualifier, `${path}.qualifier`, stringAt);
  return {
    sourceKind: enumAt(record.sourceKind, SOURCE_KINDS, `${path}.sourceKind`),
    ...(qualifier === undefined ? {} : { qualifier }),
  };
}

function parseCommonRequirementFields(record: Record<string, unknown>, path: string): ReviewRequirementTemplate {
  const acceptableSources = arrayAt(record.acceptableSources, `${path}.acceptableSources`, parseAcceptedSource);
  if (acceptableSources.length === 0) throw new Error(`${path}.acceptableSources: expected at least one source`);
  return {
    id: stringAt(record.id, `${path}.id`),
    kind: enumAt(record.kind, REQUIREMENT_KINDS, `${path}.kind`),
    obligation: enumAt(record.obligation, REQUIREMENT_OBLIGATIONS, `${path}.obligation`),
    acceptableSources,
    count: integerAt(record.count, `${path}.count`, 1),
    initialAdmission: enumAt(record.initialAdmission, INITIAL_ADMISSIONS, `${path}.initialAdmission`),
    rubricVersion: stringAt(record.rubricVersion, `${path}.rubricVersion`),
  };
}

/** Validate one review requirement. */
export function parseReviewRequirement(input: unknown, path = "requirement"): ReviewRequirement {
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "id", "kind", "obligation", "acceptableSources", "count", "initialAdmission",
    "policyVersion", "rubricVersion", "changeSetId", "headSha",
    "reasons",
  ], path);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    ...parseCommonRequirementFields(record, path),
    policyVersion: digestAt(record.policyVersion, `${path}.policyVersion`),
    reasons: arrayAt(record.reasons, `${path}.reasons`, stringAt),
    changeSetId: digestAt(record.changeSetId, `${path}.changeSetId`),
    headSha: digestAt(record.headSha, `${path}.headSha`, 40),
  };
}

function parseRequirementTemplate(input: unknown, path: string): ReviewRequirementTemplate {
  const record = objectAt(input, path);
  exactKeys(record, [
    "id", "kind", "obligation", "acceptableSources", "count", "initialAdmission", "rubricVersion",
  ], path);
  return parseCommonRequirementFields(record, path);
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
