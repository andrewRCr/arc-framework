/** A branch's linked work unit resolves to one exact generation, or refuses as a typed selection naming its repair. */
import { expect, it } from "vitest";
import { readReviewWorkUnitByRef } from "../../../../src/lib/store/review-work-unit.js";
import { ReviewOwnerSelectionError } from "../../../../src/lib/store/kinds/review/errors.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { Links } from "../../../../src/lib/store/links.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";

const projectId = async () => "project";
const link = { repository: "project", ref: "feat/example", linkedAs: "created" as const, excluded: [] };
const absentGeneration = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example",
  uid: "123e4567-e89b-42d3-a456-426614174000" }));

/** A store whose branch lookup or linked metadata read is broken until repaired. */
async function linked(broken: { lookupAbsent?: true; ownerless?: true; branches?: Readonly<NonNullable<Links["branches"]>> }) {
  const h = createLifecycleHarness();
  await h.seedMeta("example", {}, { kind: "active" }, { branches: [link] });
  let damaged = true;
  const store = Object.create(h.store) as Store;
  store.lookup = async input => {
    const result = await h.store.lookup(input);
    return damaged && broken.lookupAbsent === true && result.status === "ok"
      ? { ...result, result: { ...result.result, reference: absentGeneration } } : result;
  };
  store.read = async input => {
    const result = await h.store.read(input);
    if (!damaged || input.reference.kind !== "work-item/meta" || result.status !== "ok") return result;
    const record: StoreRecord = { ...result.result,
      ...(broken.ownerless === undefined ? {} : { fields: { ...(result.result.fields as Record<string, unknown>), owner: null } }),
      ...(broken.branches === undefined ? {} : { links: { ...result.result.links, branches: [...broken.branches] } }) };
    return { ...result, result: record };
  };
  return { store, repair: () => { damaged = false; } };
}

it.each([
  ["its metadata is missing", { lookupAbsent: true } as const, /linked work-unit metadata is missing/u,
    "Restore the work unit's metadata, or repair its branch link, then retry."],
  ["its metadata is incomplete", { ownerless: true } as const, /linked work-unit metadata is incomplete/u,
    "Repair the work unit's metadata, then retry."],
  ["two links name its branch", { branches: [link, { ...link, ref: "refs/heads/feat/example" }] },
    /duplicate canonical local refs/u, "Repair the work unit's branch links, then retry."],
  ["it links no branch here", { branches: [] }, /no branch link for feat\/example/u,
    "Repair the work unit's branch links, then retry."],
] as const)("refuses a linked work unit when %s as a typed selection, and resolves it after repair",
  async (_case, broken, condition, remedy) => {
    const { store, repair } = await linked(broken);
    const refused = readReviewWorkUnitByRef({ store, projectId }, "feat/example");
    await expect(refused).rejects.toBeInstanceOf(ReviewOwnerSelectionError);
    await expect(refused).rejects.toMatchObject({ code: "corrupt-state", condition: expect.stringMatching(condition),
      remedy: { text: remedy } });
    repair();
    expect(await readReviewWorkUnitByRef({ store, projectId }, "feat/example"))
      .toMatchObject({ name: "example", branch: "feat/example" });
  });
