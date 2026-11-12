import { expect, it } from "vitest";
import { StoreConflictInputSchema } from "../../../src/lib/store/commands.js";

const valid = { uid: "11111111-1111-4111-8111-111111111111", kind: "work-item/conflict-record", id: "clash" };
it.each(["work-item/conflict-record", "review/conflict-record"])("accepts the exact %s operand", (kind) => {
  expect(StoreConflictInputSchema.parse({ ...valid, kind, discard: true })).toEqual({ ...valid, kind, discard: true });
});
it.each([{ uid: "slug" }, { id: "" }, { kind: "personal/conflict-record" }, { kind: "work-item/meta" }, { kind: "lineage/conflict-record" }])(
  "refuses operands outside exact work-item conflict recovery: %j", (invalid) => {
    expect(StoreConflictInputSchema.safeParse({ ...valid, ...invalid }).success).toBe(false);
  });
