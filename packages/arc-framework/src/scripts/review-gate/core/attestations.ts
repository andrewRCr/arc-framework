/** Source-neutral attestation validation for durable review evidence. */

import { meetsMinimumPermission, type CapabilitySet, type ReviewRequirement, type SourceKind } from "./contracts.js";
import { parseEvidence, type Evidence } from "./evidence.js";
import { computeChangeSetId } from "./identity.js";
import {
  arrayAt,
  enumAt,
  exactKeys,
  objectAt,
  REVIEW_IDENTIFIER,
  schemaOneAt,
  stringAt,
} from "./validation.js";

/** Context resolved independently from the untrusted manifest. */
export interface AttestationValidationContext {
  requirement: ReviewRequirement;
  authenticatedActor: CapabilitySet;
  acceptedReviewerClaims: string[];
  usedRunIds: string[];
  authorIdentity: string;
}

/** Valid evidence or a fail-closed diagnostic. */
export type AttestationValidationResult =
  | { ok: true; evidence: Evidence }
  | { ok: false; error: string };

function fail(error: string): AttestationValidationResult {
  return { ok: false, error };
}

function idAt(value: unknown, path: string): string {
  const id = stringAt(value, path);
  if (!REVIEW_IDENTIFIER.test(id)) throw new Error(`${path}: invalid identifier`);
  return id;
}

function durableReferenceAt(value: unknown, path: string): string {
  const reference = stringAt(value, path);
  if (Buffer.byteLength(reference, "utf8") > 2048) throw new Error(`${path}: exceeds 2048 bytes`);
  if (!/^(?:https:\/\/|evidence:|receipt:)/u.test(reference)) throw new Error(`${path}: not durable`);
  return reference;
}

/** Validate one bounded manifest against live actor, policy, and change identities. */
export function validateAttestation(
  content: string,
  context: AttestationValidationContext,
): AttestationValidationResult {
  if (Buffer.byteLength(content, "utf8") > 32 * 1024) return fail("manifest exceeds 32 KiB");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return fail("manifest is not valid JSON");
  }

  try {
    const path = "attestation";
    const record = objectAt(parsed, path);
    exactKeys(record, [
      "schemaVersion", "sourceKind", "sourceIdentity", "reviewerClaim", "reviewRunId", "reviewerRuntime",
      "requirementId", "result", "baseRef", "diffBaseSha", "headSha", "changeSetId", "policyVersion",
      "rubricVersion", "coverage", "coverageFromSha", "coverageThroughSha", "evidenceUrlOrId", "startedAt",
      "completedAt", "findings", "closures",
    ], path);
    schemaOneAt(record.schemaVersion, `${path}.schemaVersion`);
    const sourceKind = enumAt(record.sourceKind, ["agent", "human"], `${path}.sourceKind`) as SourceKind;
    const sourceIdentity = idAt(record.sourceIdentity, `${path}.sourceIdentity`);
    const reviewerClaim = idAt(record.reviewerClaim, `${path}.reviewerClaim`);
    const reviewRunId = idAt(record.reviewRunId, `${path}.reviewRunId`);
    if (context.usedRunIds.includes(reviewRunId)) throw new Error("review run id was already used");
    if (!context.acceptedReviewerClaims.includes(reviewerClaim)) throw new Error("reviewer claim is not accepted");

    const runtime = objectAt(record.reviewerRuntime, `${path}.reviewerRuntime`);
    exactKeys(runtime, ["kind", "version"], `${path}.reviewerRuntime`);
    idAt(runtime.kind, `${path}.reviewerRuntime.kind`);
    idAt(runtime.version, `${path}.reviewerRuntime.version`);
    const requirementId = idAt(record.requirementId, `${path}.requirementId`);
    if (requirementId !== context.requirement.id) throw new Error("requirement mismatch");
    const acceptedSource = context.requirement.acceptableSources.some((accepted) =>
      accepted.sourceKind === sourceKind
      && (accepted.qualifier === undefined || accepted.qualifier === context.requirement.rubricVersion));
    if (!acceptedSource) throw new Error("source kind is not accepted by the requirement");

    if (sourceKind === "agent") {
      if (!context.authenticatedActor.permissions.some((permission) => meetsMinimumPermission(permission, "maintain"))) {
        throw new Error("agent attestation requires maintain");
      }
      if (!context.acceptedReviewerClaims.includes(sourceIdentity)) throw new Error("agent source identity is not accepted");
    } else {
      if (!context.authenticatedActor.permissions.some((permission) => meetsMinimumPermission(permission, "write"))) {
        throw new Error("human attestation requires write");
      }
      if (context.authenticatedActor.actorIdentity !== sourceIdentity) throw new Error("delegated human identity");
      if (sourceIdentity === context.authorIdentity) throw new Error("author cannot self-attest");
    }

    const startedAt = stringAt(record.startedAt, `${path}.startedAt`);
    const completedAt = stringAt(record.completedAt, `${path}.completedAt`);
    if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(completedAt))) {
      throw new Error("run timestamps are invalid");
    }
    if (Date.parse(completedAt) < Date.parse(startedAt)) throw new Error("run completed before it started");
    if (
      record.changeSetId !== context.requirement.changeSetId
      || record.headSha !== context.requirement.headSha
      || record.policyVersion !== context.requirement.policyVersion
      || record.rubricVersion !== context.requirement.rubricVersion
    ) throw new Error("attestation scope is stale or mismatched");
    const computedChangeSetId = computeChangeSetId({
      baseRef: stringAt(record.baseRef, `${path}.baseRef`),
      diffBaseSha: stringAt(record.diffBaseSha, `${path}.diffBaseSha`),
      headSha: stringAt(record.headSha, `${path}.headSha`),
    });
    if (computedChangeSetId !== record.changeSetId) throw new Error("change-set identity does not match coverage");
    if (record.coverage !== "full" || record.coverageThroughSha !== context.requirement.headSha) {
      throw new Error("attestation must cover the full current change");
    }

    const findings = arrayAt(record.findings, `${path}.findings`, (value) => value);
    const closures = arrayAt(record.closures, `${path}.closures`, (value) => value);
    if (findings.length > 256 || closures.length > 256) throw new Error("finding or closure array exceeds 256 entries");
    const evidence = parseEvidence({
      schemaVersion: 1,
      requirementId,
      sourceKind,
      sourceIdentity,
      result: record.result,
      evidenceUrlOrId: durableReferenceAt(record.evidenceUrlOrId, `${path}.evidenceUrlOrId`),
      reviewRunId,
      reviewerClaim,
      submitterIdentity: context.authenticatedActor.actorIdentity,
      policyVersion: record.policyVersion,
      rubricVersion: record.rubricVersion,
      coverage: record.coverage,
      coverageFromSha: record.coverageFromSha,
      coverageThroughSha: record.coverageThroughSha,
      baseRef: record.baseRef,
      diffBaseSha: record.diffBaseSha,
      changeSetId: record.changeSetId,
      headSha: record.headSha,
      findings,
      closures,
      observedAt: completedAt,
    });
    for (const finding of evidence.findings) {
      idAt(finding.findingId, `${path}.findings.findingId`);
      durableReferenceAt(finding.evidenceUrlOrId, `${path}.findings.evidenceUrlOrId`);
    }
    for (const closure of evidence.closures) {
      idAt(closure.findingId, `${path}.closures.findingId`);
      idAt(closure.authorityIdentity, `${path}.closures.authorityIdentity`);
      durableReferenceAt(closure.evidenceUrlOrId, `${path}.closures.evidenceUrlOrId`);
    }
    if (evidence.coverageFromSha !== evidence.diffBaseSha) throw new Error("full coverage must start at the diff base");
    return { ok: true, evidence };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
