/** Whole-set constraints for one subject owner's review lane. */
import { frontlineRetryContract } from "../../../../../scripts/review-gate/core/frontline-retry-contract.js";
import { canonicalize } from "../../../../kernel/index.js";
import { brokenRule } from "../../rule-support.js";
import type { BrokenRule } from "../../../write-check.js";
import type { ReviewOutcome } from "./schema.js";

function finished(value: ReviewOutcome): boolean { return value.outcome === "clean" || value.outcome === "findings"; }

function retryGroup(value: ReviewOutcome): string {
  return canonicalize({ logicalPass: value.logicalPass, source: value.source,
    scopeMode: value.local?.scopeMode ?? null, requestedCoverage: value.requestedCoverage,
    correctionScope: value.correctionScope ?? null });
}

function grouped(outcomes: readonly ReviewOutcome[], key: (value: ReviewOutcome) => string): ReviewOutcome[][] {
  const groups = new Map<string, ReviewOutcome[]>();
  for (const value of outcomes) {
    const identity = key(value);
    const group = groups.get(identity) ?? [];
    group.push(value);
    groups.set(identity, group);
  }
  return [...groups.values()];
}

function checkFinishedOutcomes(outcomes: readonly ReviewOutcome[]): BrokenRule[] {
  const finishedOutcomes = outcomes.filter(finished);
  const passes = finishedOutcomes.map((value) => value.logicalPass);
  const rules: BrokenRule[] = [];
  if (new Set(passes).size !== passes.length) rules.push(brokenRule("review.outcome.finished-pass",
    "More than one outcome finishes the same logical pass.",
    "Keep one authoritative finished producer per logical pass in this lane owner."));
  if (finishedOutcomes.some((producer) => outcomes.some((value) => retryGroup(value) === retryGroup(producer)
    && value.retryGeneration > producer.retryGeneration))) rules.push(brokenRule("review.outcome.after-finished-generation",
    "An outcome has a generation above its grouping's finished producer.",
    "Keep retries before their terminal producer; admit subsequent work at the next logical pass."));
  return rules;
}

function checkLocalGenerations(outcomes: readonly ReviewOutcome[]): BrokenRule[] {
  return grouped(outcomes.filter((value) => value.local !== undefined), retryGroup).flatMap((group) => {
    const generations = [...new Set(group.map((value) => value.retryGeneration))].sort((left, right) => left - right);
    const rules: BrokenRule[] = [];
    if (generations.length !== group.length) rules.push(brokenRule("review.outcome.local-generation-duplicate",
      "A local pass, source, scope, and coverage admission reuse a retry generation.",
      "Keep one outcome for each admitted local retry generation."));
    if (!generations.every((generation, index) => generation === index)) rules.push(brokenRule("review.outcome.local-generation-gap",
      "A local retry grouping lacks a lower generation from zero.",
      "Restore every lower generation of this local pass, source, scope, and coverage admission."));
    return rules;
  });
}

function checkHostedAdmissions(outcomes: readonly ReviewOutcome[]): BrokenRule[] {
  const identities = outcomes.flatMap((value) => value.hosted === undefined ? [] : [value.hosted.admission.admissionId]);
  return new Set(identities).size === identities.length ? [] : [brokenRule("review.outcome.hosted-admission",
    "A hosted admission identity occurs in more than one stored outcome.",
    "Keep exactly one ended result for each hosted admission, regardless of acknowledgment identity.")];
}

function authorizedRetryContract(value: ReviewOutcome): string {
  const local = value.local;
  const frontline = value.frontline?.admission;
  return canonicalize({ grouping: retryGroup(value),
    local: local === undefined ? null : { vehicle: local.vehicle, rubricIdentity: local.rubricIdentity ?? null,
      deliveryAdmission: local.deliveryAdmission ?? null },
    frontline: frontline === undefined ? null : frontlineRetryContract(frontline) });
}

function checkAuthorizedRetries(outcomes: readonly ReviewOutcome[]): BrokenRule[] {
  return grouped(outcomes.filter((value) => value.admittedBy !== undefined), (value) => value.admittedBy ?? "").flatMap((group) => {
    const rules: BrokenRule[] = [];
    if (new Set(group.map(authorizedRetryContract)).size !== 1) rules.push(brokenRule("review.outcome.authorized-retry-contract",
      "Outcomes admitted by one decision differ in pass, source, scope, or coverage admission.",
      "Keep each retry within the original extra-pass admission's source, scope, coverage, and logical pass."));
    const admittedGenerations = group.map((value) => value.retryGeneration);
    if (new Set(admittedGenerations).size !== admittedGenerations.length) rules.push(brokenRule("review.outcome.authorized-generation-duplicate",
      "Outcomes admitted by one decision reuse a retry generation.",
      "Keep one outcome for each generation admitted by this extra-pass decision."));
    const generations = [...new Set(group.map((value) => value.retryGeneration))].sort((left, right) => left - right);
    if (!generations.every((generation, index) => generation === index)) rules.push(brokenRule("review.outcome.authorized-generation-gap",
      "Outcomes admitted by one decision lack an earlier retry generation.",
      "Restore the original admitted outcome and every successive retry before admitting this outcome."));
    return rules;
  });
}

/** Collect cross-record violations independently of write order. */
export function checkReviewOutcomeSet(outcomes: readonly ReviewOutcome[]): readonly BrokenRule[] {
  return [...checkFinishedOutcomes(outcomes), ...checkLocalGenerations(outcomes),
    ...checkHostedAdmissions(outcomes), ...checkAuthorizedRetries(outcomes)];
}
