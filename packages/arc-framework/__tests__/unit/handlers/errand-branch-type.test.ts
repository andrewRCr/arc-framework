/** Ordinary open input admits only the policy's optional nature-type vocabulary. */
import { expect, it } from "vitest";
import { ErrandOpenInputSchema } from "../../../src/handlers/errand.js";

it.each(["fix", "chore", "refactor", "hotfix"])("admits explicit ordinary branch type %s", (type) => {
  expect(ErrandOpenInputSchema.safeParse({ slug: "repair-output", type })).toMatchObject({ success: true, data: { type } });
});

it.each(["feat", "unknown", "fix/other", "", null])("refuses invalid ordinary branch type %s", (type) => {
  expect(ErrandOpenInputSchema.safeParse({ slug: "repair-output", type }).success).toBe(false);
});
