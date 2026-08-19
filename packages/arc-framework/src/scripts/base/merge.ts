/** Exact-base, append-only merge procedure. */

import { z } from "zod";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

export const BaseMergeInputSchema = z.strictObject({
  expectedBase: ObjectIdSchema,
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
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("skipped-clean"),
    nextAction: z.literal("continue-reconcile"),
    expectedBase: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("base-moved"),
    nextAction: z.literal("rerun-checkpoint"),
    expectedBase: ObjectIdSchema,
    actualBase: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("conflict"),
    nextAction: z.literal("stop"),
    expectedBase: ObjectIdSchema,
  }),
  z.strictObject({
    ...BaseMergeResultCommon,
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["invalid-input", "operational-failure"]),
    detail: z.string().min(1),
    expectedBase: ObjectIdSchema.nullable(),
  }),
]);
export type BaseMergeResult = z.infer<typeof BaseMergeResultSchema>;

/** Mutable repository boundary used by the exact-base merge reducer. */
export interface BaseMergePort {
  refreshBase(): Promise<string>;
  containsBase(baseOid: string): Promise<boolean>;
  mergeAppendOnly(baseOid: string): Promise<"merged" | "conflict">;
}

/** Merge only the base revision approved by the preceding checkpoint. */
export async function mergeExpectedBase(
  input: BaseMergeInput,
  port: BaseMergePort,
): Promise<BaseMergeResult> {
  const request = BaseMergeInputSchema.parse(input);
  let actualBase: string;
  try {
    actualBase = ObjectIdSchema.parse(await port.refreshBase());
  } catch (error) {
    return blocked(request.expectedBase, error);
  }
  if (actualBase !== request.expectedBase) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: request.expectedBase,
      actualBase,
    };
  }
  let containsBase: boolean;
  try {
    containsBase = await port.containsBase(request.expectedBase);
  } catch (error) {
    return blocked(request.expectedBase, error);
  }
  if (containsBase) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "skipped-clean",
      nextAction: "continue-reconcile",
      expectedBase: request.expectedBase,
    };
  }
  let outcome: "merged" | "conflict";
  try {
    outcome = await port.mergeAppendOnly(request.expectedBase);
  } catch (error) {
    return blocked(request.expectedBase, error);
  }
  if (outcome === "merged") {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "merged",
      nextAction: "run-quality-gates",
      expectedBase: request.expectedBase,
    };
  }
  return {
    schemaVersion: 1,
    mode: "base-merge",
    state: "conflict",
    nextAction: "stop",
    expectedBase: request.expectedBase,
  };
}

function blocked(expectedBase: string, error: unknown): BaseMergeResult {
  return {
    schemaVersion: 1,
    mode: "base-merge",
    state: "blocked",
    nextAction: "stop",
    reason: "operational-failure",
    detail: error instanceof Error ? error.message : String(error),
    expectedBase,
  };
}
