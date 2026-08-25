/** Exact-base, append-only merge procedure. */

import { z } from "zod";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

export const BaseMergeInputSchema = z.strictObject({
  expectedBase: ObjectIdSchema,
  expectedHead: ObjectIdSchema,
});
export type BaseMergeInput = z.infer<typeof BaseMergeInputSchema>;

const BaseMergeResultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("base-merge"),
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
    ...BaseMergeResultCommon,
    state: z.literal("base-moved"),
    nextAction: z.literal("rerun-checkpoint"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualBase: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("head-moved"),
    nextAction: z.literal("rerun-checkpoint"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
    actualHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("head-contained-by-base"),
    nextAction: z.literal("rerun-checkpoint"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("conflict"),
    nextAction: z.literal("stop"),
    expectedBase: ObjectIdSchema,
    expectedHead: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["invalid-input", "operational-failure"]),
    detail: z.string().min(1),
    expectedBase: ObjectIdSchema.nullable(),
    expectedHead: ObjectIdSchema.nullable(),
  }),
]);
export type BaseMergeResult = z.infer<typeof BaseMergeResultSchema>;

/** Mutable repository boundary used by the exact-base merge reducer. */
export interface BaseMergePort {
  refreshBase(): Promise<string>;
  refreshHead(): Promise<string>;
  isAncestor(ancestorOid: string, descendantOid: string): Promise<boolean>;
  mergeAppendOnly(baseOid: string, headOid: string): Promise<
    | { status: "merged"; headOid: string }
    | { status: "conflict" }
    | { status: "head-moved"; actualHead: string }
  >;
}

async function observeEndpoints(port: BaseMergePort): Promise<{ actualBase: string; actualHead: string }> {
  const actualBase = ObjectIdSchema.parse(await port.refreshBase());
  const actualHead = ObjectIdSchema.parse(await port.refreshHead());
  return { actualBase, actualHead };
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
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      ...observation,
    };
  }
  if (observation.actualHead !== request.expectedHead) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "head-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualHead: observation.actualHead,
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
  let observation: { actualBase: string; actualHead: string };
  try {
    observation = await observeEndpoints(port);
  } catch (error) {
    return blocked(request.expectedBase, request.expectedHead, error);
  }
  const initialMovement = endpointMovement(request, observation);
  if (initialMovement !== null) return initialMovement;
  let containsBase: boolean;
  try {
    containsBase = await port.isAncestor(request.expectedBase, request.expectedHead);
  } catch (error) {
    return blocked(request.expectedBase, request.expectedHead, error);
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
    return blocked(request.expectedBase, request.expectedHead, error);
  }
  if (containsHead) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "head-contained-by-base",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
    };
  }
  try {
    observation = await observeEndpoints(port);
  } catch (error) {
    return blocked(request.expectedBase, request.expectedHead, error);
  }
  const preMergeMovement = endpointMovement(request, observation);
  if (preMergeMovement !== null) return preMergeMovement;
  let outcome: Awaited<ReturnType<BaseMergePort["mergeAppendOnly"]>>;
  try {
    outcome = await port.mergeAppendOnly(request.expectedBase, request.expectedHead);
  } catch (error) {
    return blocked(request.expectedBase, request.expectedHead, error);
  }
  if (outcome.status === "head-moved") {
    const actualHead = ObjectIdSchema.safeParse(outcome.actualHead);
    if (!actualHead.success) return blocked(request.expectedBase, request.expectedHead, actualHead.error);
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "head-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      expectedHead: request.expectedHead,
      actualHead: actualHead.data,
    };
  }
  if (outcome.status === "merged") {
    const actualHead = ObjectIdSchema.safeParse(outcome.headOid);
    if (!actualHead.success) return blocked(request.expectedBase, request.expectedHead, actualHead.error);
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
  return {
    schemaVersion: 1,
    mode: "base-merge",
    state: "conflict",
    nextAction: "stop",
    expectedBase: request.expectedBase,
    expectedHead: request.expectedHead,
  };
}

function blocked(expectedBase: string, expectedHead: string, error: unknown): BaseMergeResult {
  return {
    schemaVersion: 1,
    mode: "base-merge",
    state: "blocked",
    nextAction: "stop",
    reason: "operational-failure",
    detail: error instanceof Error ? error.message : String(error),
    expectedBase,
    expectedHead,
  };
}
