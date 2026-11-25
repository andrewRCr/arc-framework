/** Identity operands accept full UUIDs without widening rename destinations. */
import { expect, it } from "vitest";
import { RenameCommandInputSchema } from "../../../src/handlers/lifecycle.js";
import { ErrandCloseInputSchema, ErrandAbandonInputSchema } from "../../../src/handlers/errand.js";

const uid = "ABCDEF01-2345-4678-9ABC-DEF012345678";
it("accepts a full UUID subject for rename while retaining a slug-only destination", () => {
  expect(RenameCommandInputSchema.safeParse({ slug: uid, newSlug: "renamed" }).success).toBe(true);
  expect(RenameCommandInputSchema.safeParse({ slug: "example", newSlug: uid }).success).toBe(false);
});
it.each([
  { command: "close", schema: ErrandCloseInputSchema },
  { command: "abandon", schema: ErrandAbandonInputSchema },
])("accepts a full UUID subject for Errand $command", ({ schema }) => {
  expect(schema.safeParse({ slug: uid, json: true }).success).toBe(true);
});
