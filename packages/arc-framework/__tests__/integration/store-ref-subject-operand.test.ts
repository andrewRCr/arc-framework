/** Subject selection retains exact identity and recovery over real Git refs. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { resolveSubjectOperand } from "../../src/lib/store/subject-operand.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { success } from "../helpers/store/suite-tools.js";

const primaryKinds = ["work-item/meta", "work-item/record", "cohort/document"] as const;
const uidA = "abcdef01-2345-4678-9abc-def012345678", uidB = "abcdef02-2345-4678-9abc-def012345678";
const options = (operand: string) => ({ operand, primaryKinds, typeRule: "rename" as const, resolveSlug: true });

it("selects a cohort's exact primary by uppercase UID", async () => {
  const f = await createRefFixture();
  const reference = await plantRefPrimary(f, { kind: "cohort/document", name: "subject", uid: uidA });
  const primary = success(await f.store.read({ reference }));
  expect(await resolveSubjectOperand(f.store, options(uidA.toUpperCase())))
    .toMatchObject({ status: "selected", primary, selectedBy: "uid", operand: uidA.toUpperCase() });
});

it("refuses a UID shared across the work-item and cohort families", async () => {
  const f = await createRefFixture();
  const work = await plantRefPrimary(f, { kind: "work-item/meta", name: "work", uid: uidA });
  const cohort = await plantRefPrimary(f, { kind: "cohort/document", name: "cohort", uid: uidA });
  expect(await resolveSubjectOperand(f.store, options(uidA))).toMatchObject({ status: "refused", refusal: {
    code: "ambiguous-match", candidates: expect.arrayContaining([work, cohort]),
  } });
});

it("passes a cross-family slug refusal through with its ranked repair", async () => {
  const f = await createRefFixture();
  await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: uidA });
  await plantRefPrimary(f, { kind: "cohort/document", name: "shared", uid: uidB });
  const expected = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") });
  expect(expected).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", tie: { liveness: "live", name: "current" } } });
  expect(await resolveSubjectOperand(f.store, options("shared"))).toEqual(expected);
});

it("preserves a real listing fault's repair instead of declaring the UID absent", async () => {
  const f = await createRefFixture();
  const reference = await plantRefPrimary(f, { kind: "work-item/meta", name: "subject", uid: uidA });
  await f.plant(reference, "unknown-format-version");
  const listed = success(await f.store.list({ family: "work-item", kind: "work-item/meta" }));
  const repair = listed.status === "unreadable" ? listed.remedy
    : listed.status === "complete" ? listed.diagnostics[0]?.remedy : undefined;
  if (repair === undefined) throw new Error("Expected a listing repair");
  expect(await resolveSubjectOperand(f.store, options(uidA))).toMatchObject({ status: "unselected", remedy: repair });
});
