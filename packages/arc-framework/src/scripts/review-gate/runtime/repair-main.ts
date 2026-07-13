/** Pure orchestration for bounded repair validation output. */

import { hashContent } from "../../../lib/manifest/hash.js";
import { validateRepairAttestation } from "../core/attestations.js";
import { canonicalizePlainJson } from "../core/identity.js";
import { integerAt, objectAt, stringAt } from "../core/validation.js";
import type { RepairWriterAuditResult } from "../hosts/github/repair-audit.js";
import type { RepairAttestationResolution } from "../hosts/github/repair-context.js";

export interface RepairValidationInput {
  manifest: string;
  selectedRef: string;
  defaultBranch: string;
}

export interface RepairDispatchEvent {
  repositoryId: string;
  pullRequestNumber: number;
  actorId: string;
  actorLogin: string;
  manifest: string;
}

/** Parse only the typed default-branch repository-dispatch payload used by repair validation. */
export function parseRepairDispatchEvent(input: unknown): RepairDispatchEvent {
  const event = objectAt(input, "repairEvent");
  if (event.action !== "review-gate-repair") throw new Error("repairEvent.action: invalid repair event");
  const repository = objectAt(event.repository, "repairEvent.repository");
  const sender = objectAt(event.sender, "repairEvent.sender");
  const payload = objectAt(event.client_payload, "repairEvent.client_payload");
  return {
    repositoryId: String(integerAt(repository.id, "repairEvent.repository.id", 1)),
    pullRequestNumber: integerAt(payload.pull_request, "repairEvent.client_payload.pull_request", 1),
    actorId: String(integerAt(sender.id, "repairEvent.sender.id", 1)),
    actorLogin: stringAt(sender.login, "repairEvent.sender.login"),
    manifest: stringAt(payload.payload, "repairEvent.client_payload.payload"),
  };
}

export interface RepairValidationDependencies {
  resolveContext(): Promise<RepairAttestationResolution>;
  usedRunIds: string[];
  auditGraph(): Promise<RepairWriterAuditResult>;
  verifyEnvironment(): Promise<string[]>;
  now: Date;
}

export interface QualifiedRepairValidation {
  status: "qualified";
  repositoryId: string;
  pullRequestNumber: number;
  headSha: string;
  workflowPath: string;
  workflowSha: string;
  runId: string;
  runAttempt: number;
  evidenceRef: string;
  validationDigest: string;
}

function bindControllerContext(content: string, context: RepairAttestationResolution): string {
  const parsed = JSON.parse(content) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("repair-validation:manifest-not-object");
  }
  const record = parsed as Record<string, unknown>;
  const bindings: Record<string, unknown> = {
    purpose: "repair-authority",
    repositoryIdentity: context.repair.repositoryId,
    changeRequestOrdinal: context.repair.changeRequestOrdinal,
    authorIdentity: context.authorIdentity,
    controllerExecution: {
      id: context.repair.controllerExecutionId,
      attempt: context.repair.controllerExecutionAttempt,
      definitionRef: context.repair.controllerDefinitionRef,
      definitionSha: context.repair.controllerDefinitionSha,
    },
  };
  for (const [key, value] of Object.entries(bindings)) {
    if (record[key] === undefined) record[key] = value;
  }
  return JSON.stringify(record);
}

/** Require default-branch code, exact evidence, exclusive writer, and protected environment before output. */
export async function validateRepairDispatch(
  input: RepairValidationInput,
  deps: RepairValidationDependencies,
): Promise<QualifiedRepairValidation> {
  if (input.selectedRef !== input.defaultBranch) throw new Error("repair-validation:non-default-dispatch-ref");
  const [context, audit, environmentErrors] = await Promise.all([
    deps.resolveContext(),
    deps.auditGraph(),
    deps.verifyEnvironment(),
  ]);
  if (!audit.ok) throw new Error(`repair-validation:exclusive-writer:${audit.errors.join(",")}`);
  if (environmentErrors.length > 0) {
    throw new Error(`repair-validation:environment:${environmentErrors.join(",")}`);
  }
  const attestation = validateRepairAttestation(bindControllerContext(input.manifest, context), {
    ...context,
    usedRunIds: deps.usedRunIds,
    now: deps.now,
  });
  if (!attestation.ok) throw new Error(`repair-validation:attestation:${attestation.error}`);
  const result = {
    status: "qualified" as const,
    repositoryId: context.repair.repositoryId,
    pullRequestNumber: context.repair.changeRequestOrdinal,
    headSha: context.requirement.headSha,
    workflowPath: context.repair.controllerDefinitionRef,
    workflowSha: context.repair.controllerDefinitionSha,
    runId: context.repair.controllerExecutionId,
    runAttempt: context.repair.controllerExecutionAttempt,
    evidenceRef: attestation.evidence.evidenceUrlOrId,
  };
  return {
    ...result,
    validationDigest: hashContent(canonicalizePlainJson(result)),
  };
}
