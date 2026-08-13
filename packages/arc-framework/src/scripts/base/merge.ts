/** Exact-base, append-only merge procedure. */

import { z } from "zod";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

export const BaseMergeInputSchema = z.strictObject({
  expectedBase: ObjectIdSchema,
});
export type BaseMergeInput = z.infer<typeof BaseMergeInputSchema>;

export type BaseMergeResult =
  | { schemaVersion: 1; mode: "base-merge"; state: "merged"; nextAction: "run-quality-gates"; expectedBase: string }
  | { schemaVersion: 1; mode: "base-merge"; state: "skipped-clean"; nextAction: "continue-reconcile"; expectedBase: string }
  | {
      schemaVersion: 1;
      mode: "base-merge";
      state: "base-moved";
      nextAction: "rerun-checkpoint";
      expectedBase: string;
      actualBase: string;
    }
  | { schemaVersion: 1; mode: "base-merge"; state: "conflict"; nextAction: "stop"; expectedBase: string };

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
  const actualBase = ObjectIdSchema.parse(await port.refreshBase());
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
  if (await port.containsBase(request.expectedBase)) {
    return {
      schemaVersion: 1,
      mode: "base-merge",
      state: "skipped-clean",
      nextAction: "continue-reconcile",
      expectedBase: request.expectedBase,
    };
  }
  const outcome = await port.mergeAppendOnly(request.expectedBase);
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
