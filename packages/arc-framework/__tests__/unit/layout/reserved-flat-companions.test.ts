/** Flat active companions cannot occupy the shared Errand directory. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { ArcLayoutAddressSchema, identifyArcFileAddress, resolveArcPath } from "../../../src/lib/layout/index.js";

it("keeps literal own-flat companions out of the shared in-flight directory", () => {
  const address = (key: string, layoutActive: "flat" | "nested") => ({ kind: "work-unit-companion", slug: "alpha",
    placement: { kind: "active", scope: { kind: "project", location: { kind: "own", claim: "alpha", layoutActive } } }, key });
  expect(resolveArcPath(ArcLayoutAddressSchema.parse(address("in-flight", "flat"))))
    .toBe(".arc/active/in-flight-alpha.md");
  expect(resolveArcPath(ArcLayoutAddressSchema.parse(address("./in-flight", "nested"))))
    .toBe(".arc/active/current/in-flight");
  expect(ArcLayoutAddressSchema.safeParse(address("in-flight/other/note.txt", "flat")).success).toBe(false);
  expect(identifyArcFileAddress(".arc/active/in-flight", { active: { claim: SlugSchema.parse("alpha"), layoutActive: "flat" } })).toBeNull();
  const bad = ArcLayoutAddressSchema.safeParse(address("./in-flight", "flat"));
  expect(bad.success).toBe(false);
});
