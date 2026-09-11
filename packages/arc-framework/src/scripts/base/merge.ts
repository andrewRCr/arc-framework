/** Exact-base, append-only merge procedure. */

import { z } from "zod";

import { SpineRemedySchema, spineRemedy } from "../integration/spine-refusal.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

export const BaseMergeInputSchema = z.strictObject({
  expectedBase: ObjectIdSchema,
  expectedHead: ObjectIdSchema,
  conflictRemedy: z.literal("regenerate-roadmap").optional(),
});
export type BaseMergeInput = z.infer<typeof BaseMergeInputSchema>;

const BaseMergeResultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("base-merge"),
};
const DetailSchema = z.string().trim().min(1).max(4_096);
const BaseMergeCoordinatesSchema = z.strictObject({
  expectedBase: ObjectIdSchema.nullable(),
  expectedHead: ObjectIdSchema.nullable(),
  actualBase: ObjectIdSchema.nullable(),
  actualHead: ObjectIdSchema.nullable(),
});
const BaseMergeContinuationSchema = z.union([
  z.strictObject({ kind: z.literal("remedy"), remedy: SpineRemedySchema }),
  z.strictObject({ kind: z.literal("terminal-explanation"), terminalExplanation: DetailSchema }),
]);
const BaseMergeNonSuccessCommon = {
  ...BaseMergeResultCommon,
  detail: DetailSchema,
  coordinates: BaseMergeCoordinatesSchema,
  continuation: BaseMergeContinuationSchema,
};

export const BaseMergeResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("merged"),
    nextAction: z.literal("run-quality-gates"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("skipped-clean"),
    nextAction: z.literal("continue-reconcile"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeNonSuccessCommon,
    state: z.literal("base-moved"),
    reason: z.literal("base-moved"),
    nextAction: z.literal("rerun-checkpoint"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualBase: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeNonSuccessCommon,
    state: z.literal("head-moved"),
    reason: z.literal("head-moved"),
    nextAction: z.literal("rerun-checkpoint"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualBase: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeNonSuccessCommon,
    state: z.literal("head-contained-by-base"),
    reason: z.literal("head-contained-by-base"),
    nextAction: z.literal("rerun-checkpoint"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualBase: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeNonSuccessCommon,
    state: z.literal("conflict"),
    reason: z.literal("merge-conflict"),
    nextAction: z.literal("stop"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualBase: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeNonSuccessCommon,
    state: z.literal("regenerable-refused"),
    reason: z.literal("regenerable-remedy-refused"),
    nextAction: z.literal("stop"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualBase: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeNonSuccessCommon,
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["invalid-input", "operational-failure"]),
    expectedBase: ObjectIdSchema.nullable(),
    expectedHead: ObjectIdSchema.nullable(),
    actualBase: ObjectIdSchema.nullable(),
    actualHead: ObjectIdSchema.nullable(),
  }),
]);
export type BaseMergeResult = z.infer<typeof BaseMergeResultSchema>;

/** Mutable repository boundary used by the exact-base merge reducer. */
export interface BaseMergePort {
  refreshBase(): Promise<string>;
  refreshHead(): Promise<string>;
  isAncestor(ancestorOid: string, descendantOid: string): Promise<boolean>;
  mergeAppendOnly(baseOid: string, headOid: string, conflictRemedy?: "regenerate-roadmap"): Promise<
    | { status: "merged"; headOid: string }
    | { status: "conflict"; detail: string }
    | { status: "remedy-refused"; detail: string }
    | { status: "head-moved"; actualHead: string }
  >;
}

type EndpointObservation = { actualBase: string; actualHead: string };
type EndpointObservationResult =
  | ({ status: "available" } & EndpointObservation)
  | {
      status: "unavailable";
      error: unknown;
      actualBase: string | null;
      actualHead: null;
    };

async function observeEndpoints(port: BaseMergePort): Promise<EndpointObservationResult> {
  let actualBase: string;
  try {
    actualBase = ObjectIdSchema.parse(await port.refreshBase());
  } catch (error) {
    return { status: "unavailable", error, actualBase: null, actualHead: null };
  }
  try {
    return {
      status: "available",
      actualBase,
      actualHead: ObjectIdSchema.parse(await port.refreshHead()),
    };
  } catch (error) {
    return { status: "unavailable", error, actualBase, actualHead: null };
  }
}

function endpointMovement(
  request: BaseMergeInput,
  observation: { actualBase: string; actualHead: string },
): BaseMergeResult | null {
  if (observation.actualBase !== request.expectedBase) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "base-moved",
      reason: "base-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      ...observation,
      detail: "The configured base moved after the checkpoint authorized the merge.",
      coordinates: coordinates(request, observation),
      continuation: checkpointTerminalContinuation(),
    };
  }
  if (observation.actualHead !== request.expectedHead) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "head-moved",
      reason: "head-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualBase: observation.actualBase,
      actualHead: observation.actualHead,
      detail: "The local Candidate head moved after the checkpoint authorized the merge.",
      coordinates: coordinates(request, observation),
      continuation: checkpointTerminalContinuation(),
    };
  }
  return null;
}

/** Merge only the base revision approved by the preceding checkpoint. */
export async function mergeExpectedBase(
  input: BaseMergeInput,
  port: BaseMergePort,
): Promise<BaseMergeResult> {
  const request = BaseMergeInputSchema.parse(input);
  let endpointRead = await observeEndpoints(port);
  if (endpointRead.status === "unavailable") {
    return blockedBaseMergeResult({
      reason: "operational-failure",
      detail: endpointRead.error,
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualBase: endpointRead.actualBase,
      actualHead: endpointRead.actualHead,
    });
  }
  let observation: EndpointObservation = endpointRead;
  const initialMovement = endpointMovement(request, observation);
  if (initialMovement !== null) return initialMovement;
  let containsBase: boolean;
  try {
    containsBase = await port.isAncestor(request.expectedBase, request.expectedHead);
  } catch (error) {
    return blocked(request.expectedBase, request.expectedHead, error, observation);
  }
  if (containsBase) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "skipped-clean",
      nextAction: "continue-reconcile",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
    };
  }
  let containsHead: boolean;
  try {
    containsHead = await port.isAncestor(request.expectedHead, request.expectedBase);
  } catch (error) {
    return blocked(request.expectedBase, request.expectedHead, error, observation);
  }
  if (containsHead) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "head-contained-by-base",
      reason: "head-contained-by-base",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualBase: observation.actualBase,
      actualHead: observation.actualHead,
      detail: "The approved Candidate head is already contained by the refreshed base.",
      coordinates: coordinates(request, observation),
      continuation: checkpointTerminalContinuation(),
    };
  }
  endpointRead = await observeEndpoints(port);
  if (endpointRead.status === "unavailable") {
    return blockedBaseMergeResult({
      reason: "operational-failure",
      detail: endpointRead.error,
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualBase: endpointRead.actualBase,
      actualHead: endpointRead.actualHead,
    });
  }
  observation = endpointRead;
  const preMergeMovement = endpointMovement(request, observation);
  if (preMergeMovement !== null) return preMergeMovement;
  let outcome: Awaited<ReturnType<BaseMergePort["mergeAppendOnly"]>>;
  try {
    outcome = await port.mergeAppendOnly(
      request.expectedBase,
      request.expectedHead,
      request.conflictRemedy,
    );
  } catch (error) {
    return blocked(request.expectedBase, request.expectedHead, error, observation);
  }
  if (outcome.status === "head-moved") {
    const actualHead = ObjectIdSchema.safeParse(outcome.actualHead);
    if (!actualHead.success) {
      return blocked(request.expectedBase, request.expectedHead, actualHead.error, observation);
    }
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "head-moved",
      reason: "head-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualBase: observation.actualBase,
      actualHead: actualHead.data,
      detail: "The local Candidate head moved immediately before the append-only merge.",
      coordinates: coordinates(request, { actualBase: observation.actualBase, actualHead: actualHead.data }),
      continuation: checkpointTerminalContinuation(),
    };
  }
  if (outcome.status === "merged") {
    const actualHead = ObjectIdSchema.safeParse(outcome.headOid);
    if (!actualHead.success) {
      return blocked(request.expectedBase, request.expectedHead, actualHead.error, observation);
    }
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "merged",
      nextAction: "run-quality-gates",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualHead: actualHead.data,
    };
  }
  if (outcome.status === "remedy-refused") {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "regenerable-refused",
      reason: "regenerable-remedy-refused",
      nextAction: "stop",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualBase: observation.actualBase,
      actualHead: observation.actualHead,
      detail: sanitizeBaseMergeDetail(outcome.detail),
      coordinates: coordinates(request, observation),
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "Resolve the reported regenerable conflict-remedy refusal, then recompose the owning checkpoint.",
      },
    };
  }
  return {
    schemaVersion: 1,
    mode: "base-merge",
    state: "conflict",
    reason: "merge-conflict",
    nextAction: "stop",
    expectedBase: request.expectedBase,
    expectedHead: request.expectedHead,
    actualBase: observation.actualBase,
    actualHead: observation.actualHead,
    detail: sanitizeBaseMergeDetail(outcome.detail),
    coordinates: coordinates(request, observation),
    continuation: {
      kind: "terminal-explanation",
      terminalExplanation: "No safe automated continuation exists; resolve the conflict and recompose the owning checkpoint.",
    },
  };
}

function coordinates(
  request: { expectedBase: string | null; expectedHead: string | null },
  observation?: { actualBase: string | null; actualHead: string | null },
) {
  return {
    expectedBase: request.expectedBase,
    expectedHead: request.expectedHead,
    actualBase: observation?.actualBase ?? null,
    actualHead: observation?.actualHead ?? null,
  };
}

function checkpointTerminalContinuation() {
  return {
    kind: "terminal-explanation" as const,
    terminalExplanation: "This command has no work-unit identity; recompose the owning checkpoint before retrying.",
  };
}

/** Normalize one agent-facing base-merge diagnostic. */
export function sanitizeBaseMergeDetail(value: unknown): string {
  const detail = (value instanceof Error ? value.message : String(value)).replace(/\s+/gu, " ").trim();
  return detail.slice(0, 4_096) || "The base-merge operation failed without diagnostic detail.";
}

/** Compose a schema-valid blocked base-merge result at a handler or adapter boundary. */
export function blockedBaseMergeResult(input: {
  reason: "invalid-input" | "operational-failure";
  detail: unknown;
  expectedBase: string | null;
  expectedHead: string | null;
  actualBase?: string | null;
  actualHead?: string | null;
}): BaseMergeResult {
  const observation = { actualBase: input.actualBase ?? null, actualHead: input.actualHead ?? null };
  return {
    schemaVersion: 1,
    mode: "base-merge",
    state: "blocked",
    nextAction: "stop",
    reason: input.reason,
    detail: sanitizeBaseMergeDetail(input.detail),
    expectedBase: input.expectedBase,
    expectedHead: input.expectedHead,
    ...observation,
    coordinates: coordinates(input, observation),
    continuation: input.reason === "invalid-input"
      ? {
          kind: "remedy",
          remedy: spineRemedy(
            "The base merge requires exact base and Candidate commit object IDs.",
            "Review command usage",
            ["arc", "base", "merge", "--help"],
          ),
        }
      : {
          kind: "terminal-explanation",
          terminalExplanation: "Resolve the reported operational failure and recompose the owning checkpoint before retrying.",
        },
  };
}

function blocked(
  expectedBase: string,
  expectedHead: string,
  error: unknown,
  observation?: { actualBase: string; actualHead: string },
): BaseMergeResult {
  return blockedBaseMergeResult({
    reason: "operational-failure",
    detail: error,
    expectedBase,
    expectedHead,
    ...observation,
  });
}
