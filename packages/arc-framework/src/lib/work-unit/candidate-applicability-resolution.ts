/** Exact-bound Candidate applicability selection over the versioned Candidate record seam. */

import { z } from "zod";

import { canonicalize } from "../canonical/canonical-json.js";
import {
  CandidateApplicabilityResultSchema,
  type CandidateApplicabilityRequest,
  type CandidateApplicabilityResult,
} from "./candidate-applicability.js";
import {
  CandidateApplicabilitySelectionV1Schema,
  CandidateLineageTargetSchema,
  CandidateManagedRecordV1Schema,
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
  type CandidateApplicabilitySelectionV1,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
} from "./candidate-attestation.js";
import type { VersionedCandidateRecord } from "./candidate-record-store.js";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const ResolutionInputCommon = {
  schemaVersion: z.literal(1),
  expectedRecordVersion: DigestSchema,
  candidateId: DigestSchema,
  priorTarget: CandidateLineageTargetSchema,
  currentTarget: CandidateLineageTargetSchema,
  currentBase: ObjectIdSchema,
  projectionDigest: DigestSchema,
  residualDigest: DigestSchema,
};

export const CandidateApplicabilityResolutionSelectorSchema = z.strictObject(ResolutionInputCommon);
export type CandidateApplicabilityResolutionSelector = z.infer<
  typeof CandidateApplicabilityResolutionSelectorSchema
>;

const ResolutionSelectionCommon = {
  ...ResolutionInputCommon,
  selectedBy: z.string().trim().min(1),
};

export const CandidateApplicabilityResolutionInputSchema = z.discriminatedUnion("choice", [
  z.strictObject({ ...ResolutionSelectionCommon, choice: z.literal("covered") }),
  z.strictObject({
    ...ResolutionSelectionCommon,
    choice: z.literal("targeted-check"),
    targetedEvidenceRef: z.string().trim().min(1),
  }),
  z.strictObject({ ...ResolutionSelectionCommon, choice: z.literal("changed") }),
]);
export type CandidateApplicabilityResolutionInput = z.infer<
  typeof CandidateApplicabilityResolutionInputSchema
>;

const ResolutionResultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("candidate-applicability-resolve"),
};
export const CandidateApplicabilityResolutionResultSchema = z.union([
  z.strictObject({
    ...ResolutionResultCommon,
    state: z.enum(["resolved", "exact-replay"]),
    nextAction: z.enum(["commit-selection", "continue", "establish-new-root"]),
    candidateId: DigestSchema,
    choice: z.enum(["covered", "targeted-check", "changed"]),
  }).superRefine((value, context) => {
    const expected = value.choice === "changed"
      ? ["establish-new-root"]
      : ["commit-selection", "continue"];
    if (!expected.includes(value.nextAction)) {
      context.addIssue({ code: "custom", path: ["nextAction"], message: `must be ${expected.join(" or ")}` });
    }
  }),
  z.strictObject({
    ...ResolutionResultCommon,
    state: z.literal("stale-bound-input"),
    nextAction: z.literal("reclassify"),
    reason: z.enum([
      "candidate-id-changed",
      "prior-target-changed",
      "current-target-changed",
      "current-base-changed",
      "projection-changed",
      "residual-changed",
    ]),
  }),
  z.strictObject({
    ...ResolutionResultCommon,
    state: z.literal("version-conflict"),
    nextAction: z.literal("rerun"),
  }),
  z.strictObject({
    ...ResolutionResultCommon,
    state: z.literal("projection-failed"),
    nextAction: z.literal("return-to-projection"),
    reason: z.enum(["candidate-unavailable", "execution-unavailable", "decision-no-longer-required"]),
    projection: CandidateApplicabilityResultSchema.nullable(),
  }),
  z.strictObject({
    ...ResolutionResultCommon,
    state: z.literal("invalid-input"),
    nextAction: z.literal("correct-input"),
  }),
  z.strictObject({
    ...ResolutionResultCommon,
    state: z.literal("execution-unavailable"),
    nextAction: z.literal("stop"),
    reason: z.enum([
      "project-root-unavailable",
      "active-work-unit-mismatch",
      "active-work-unit-unavailable",
      "execution-failed",
      "invalid-service-result",
    ]),
  }),
]);
export type CandidateApplicabilityResolutionResult = z.infer<
  typeof CandidateApplicabilityResolutionResultSchema
>;

export interface CandidateApplicabilityResolutionContext {
  readonly readRecord: () => Promise<VersionedCandidateRecord>;
  readonly currentTarget: (baseRevision: string) => Promise<CandidateLineageTarget>;
  readonly currentBase: () => Promise<string>;
  readonly projectApplicability: (
    request: CandidateApplicabilityRequest,
  ) => Promise<CandidateApplicabilityResult>;
  readonly writeRecord: (
    record: CandidateManagedRecordV1,
    expectedVersion: string,
  ) => Promise<"written" | "version-conflict">;
}

function exactTarget(left: CandidateLineageTarget, right: CandidateLineageTarget): boolean {
  return left.revision === right.revision
    && left.subject.subjectDigest === right.subject.subjectDigest;
}

function selection(input: CandidateApplicabilityResolutionInput): CandidateApplicabilitySelectionV1 {
  return CandidateApplicabilitySelectionV1Schema.parse({
    transitionKind: "applicability-selection",
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    candidateId: input.candidateId,
    priorTarget: input.priorTarget,
    currentTarget: input.currentTarget,
    projectionDigest: input.projectionDigest,
    residualDigest: input.residualDigest,
    selectedBy: input.selectedBy,
    choice: input.choice,
    ...(input.choice === "targeted-check" ? { targetedEvidenceRef: input.targetedEvidenceRef } : {}),
  });
}

function result(value: Record<string, unknown>): CandidateApplicabilityResolutionResult {
  return CandidateApplicabilityResolutionResultSchema.parse({
    schemaVersion: 1,
    mode: "candidate-applicability-resolve",
    ...value,
  });
}

async function rederive(
  context: CandidateApplicabilityResolutionContext,
  input: CandidateApplicabilityResolutionInput,
  baselineRecord: CandidateManagedRecordV1,
): Promise<CandidateApplicabilityResult | CandidateApplicabilityResolutionResult> {
  const baseline = reduceCandidateDurableBaseline(baselineRecord);
  if (baseline.candidateId !== input.candidateId) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "candidate-id-changed" });
  }
  if (!exactTarget(baseline.target, input.priorTarget)) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "prior-target-changed" });
  }
  let current: CandidateLineageTarget;
  let currentBase: string;
  let projection: CandidateApplicabilityResult;
  try {
    currentBase = ObjectIdSchema.parse(await context.currentBase());
    current = CandidateLineageTargetSchema.parse(await context.currentTarget(currentBase));
    if (!exactTarget(current, input.currentTarget)) {
      return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "current-target-changed" });
    }
    if (currentBase !== input.currentBase) {
      return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "current-base-changed" });
    }
    projection = CandidateApplicabilityResultSchema.parse(await context.projectApplicability({
      candidateId: baseline.candidateId,
      baselineTarget: baseline.target,
      currentTarget: current,
      currentBase,
    }));
  } catch {
    return result({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "execution-unavailable",
      projection: null,
    });
  }
  if (projection.state !== "decision-required") {
    return result({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "decision-no-longer-required",
      projection,
    });
  }
  if (projection.projectionDigest !== input.projectionDigest) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "projection-changed" });
  }
  if (projection.residualDigest !== input.residualDigest) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "residual-changed" });
  }
  return projection;
}

/** Re-derive and atomically append one authority-selected Candidate applicability transition. */
export async function resolveCandidateApplicability(
  context: CandidateApplicabilityResolutionContext,
  rawInput: CandidateApplicabilityResolutionInput,
): Promise<CandidateApplicabilityResolutionResult> {
  const input = CandidateApplicabilityResolutionInputSchema.parse(rawInput);
  const versioned = await context.readRecord();
  if (versioned.record === null || versioned.version === null) {
    return result({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "candidate-unavailable",
      projection: null,
    });
  }
  const requestedSelection = selection(input);
  const tail = versioned.record.transitions.at(-1);
  const exactReplay = tail?.transitionKind === "applicability-selection"
    && canonicalize(tail) === canonicalize(requestedSelection);
  const baselineRecord = exactReplay
    ? CandidateManagedRecordV1Schema.parse({
        ...versioned.record,
        transitions: versioned.record.transitions.slice(0, -1),
      })
    : versioned.record;
  if (!exactReplay && versioned.version !== input.expectedRecordVersion) {
    return result({ state: "version-conflict", nextAction: "rerun" });
  }
  if (exactReplay && input.choice !== "changed") {
    let current: CandidateLineageTarget;
    let currentBase: string;
    try {
      currentBase = ObjectIdSchema.parse(await context.currentBase());
      current = CandidateLineageTargetSchema.parse(await context.currentTarget(currentBase));
    } catch {
      return result({
        state: "projection-failed",
        nextAction: "return-to-projection",
        reason: "execution-unavailable",
        projection: null,
      });
    }
    if (currentBase !== input.currentBase) {
      return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "current-base-changed" });
    }
    if (projectCandidateCurrentness({ record: versioned.record, current }).status !== "current") {
      return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "current-target-changed" });
    }
    return result({
      state: "exact-replay",
      nextAction: "continue",
      candidateId: input.candidateId,
      choice: input.choice,
    });
  }
  const projection = await rederive(context, input, baselineRecord);
  if ("mode" in projection && projection.mode === "candidate-applicability-resolve") return projection;
  if (exactReplay) {
    return result({
      state: "exact-replay",
      nextAction: input.choice === "changed" ? "establish-new-root" : "continue",
      candidateId: input.candidateId,
      choice: input.choice,
    });
  }
  const nextRecord = CandidateManagedRecordV1Schema.parse({
    ...versioned.record,
    transitions: [...versioned.record.transitions, requestedSelection],
  });
  if (await context.writeRecord(nextRecord, input.expectedRecordVersion) === "version-conflict") {
    return result({ state: "version-conflict", nextAction: "rerun" });
  }
  return result({
    state: "resolved",
    nextAction: input.choice === "changed" ? "establish-new-root" : "continue",
    candidateId: input.candidateId,
    choice: input.choice,
  });
}
