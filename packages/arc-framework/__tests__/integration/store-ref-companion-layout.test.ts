/** Companion layout keys retain their identity across backend admission, repair, and rename. */
import { describe, expect, it } from "vitest";
import { KIND_REGISTRY, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefFixture, type RefFixtureLayout } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

async function fixture(layout: RefFixtureLayout) {
  const f = await createRefFixture({ "work-item/meta": KIND_REGISTRY["work-item/meta"] }, layout);
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
  const primary = await seed(f, reference, makeMetaFixture("alpha"));
  return { f, primary };
}
const content = "Keep these companion bytes.\n";
const refused = (condition: string) => ({ status: "refused", refusal: {
  code: "unsupported", class: "terminal", case: "unhomed-kind", condition: expect.stringContaining(condition),
  remedy: { text: expect.stringContaining("retry") },
} });

describe.each(["default", "separate"] as const)("companion layout admission (%s)", layout => {
  it("retains literal root and named companions through reopen and owner rename", async () => {
    const { f, primary } = await fixture(layout);
    const companion = (key: string) => RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key });
    for (const key of ["./readme", "readme"]) {
      success(await f.store.write({ action: "put", reference: companion(key), content: `${key}\n`, expected: null, provenance: testProvenance }));
    }
    const reopened = f.reopen();
    const before = success(await reopened.list({ family: "work-item", kind: "work-item/companion", owner: primary.reference.owner }));
    expect(before).toMatchObject({ status: "complete", diagnostics: [], missed: false });
    if (before.status !== "complete") throw new Error("Missing companion inventory");
    expect(before.records.map(row => row.reference.key).sort()).toEqual(["./readme", "readme"]);
    const betaRef = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: "beta" } });
    const renamed = success(await reopened.write({ ...update(f, primary, makeMetaFixture("beta")), reference: betaRef }));
    const after = f.reopen();
    for (const key of ["./readme", "readme"]) {
      const reference = RecordReferenceSchema.parse({ ...companion(key), owner: renamed.reference.owner });
      expect(success(await after.read({ reference })).content).toBe(`${key}\n`);
      const home = expandStoredPath(reference);
      expect(home.path).toBe(key === "./readme" ? "readme" : "readme-beta.md");
      const bytes = await f.ports.rawExec([...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "show", `${home.ref}:${home.path}`], { cwd: f.root });
      expect(new TextDecoder().decode(bytes.stdout)).toBe(`${key}\n`);
    }
    const listed = success(await after.list({ family: "work-item", kind: "work-item/companion", owner: renamed.reference.owner }));
    expect(listed).toMatchObject({ status: "complete", diagnostics: [], missed: false });
    if (listed.status !== "complete") throw new Error("Renamed companion inventory missing");
    expect(listed.records.map(row => row.reference.key).sort()).toEqual(["./readme", "readme"]);
  });
  it("refuses a registered role key and persists the same bytes under a repaired key", async () => {
    const { f, primary } = await fixture(layout);
    const companion = (key: string) => RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key });
    const before = success(await f.store.version());
    expect(await f.store.write({ action: "put", reference: companion("meta"), content, expected: null, provenance: testProvenance }))
      .toMatchObject(refused("work-item/meta"));
    expect(success(await f.store.version())).toBe(before);
    success(await f.store.write({ action: "put", reference: companion("research"), content, expected: null, provenance: testProvenance }));
    expect(success(await f.reopen().read({ reference: companion("research") })).content).toBe(content);
  });

  it("keeps a former owner's literal basename after rename and refuses a current-owner alias with a repaired retry", async () => {
    const { f, primary } = await fixture(layout);
    const renamed = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: "beta" } });
    const beta = success(await f.store.write({ ...update(f, primary, makeMetaFixture("beta")), reference: renamed }));
    const companion = (key: string) => RecordReferenceSchema.parse({ kind: "work-item/companion", owner: beta.reference.owner, key });
    success(await f.store.write({ action: "put", reference: companion("extra-alpha.md"), content, expected: null, provenance: testProvenance }));
    expect(success(await f.reopen().read({ reference: companion("extra-alpha.md") })).content).toBe(content);
    const before = success(await f.store.version());
    expect(await f.store.write({ action: "put", reference: companion("extra-beta.md"), content, expected: null, provenance: testProvenance }))
      .toMatchObject(refused("decodes as work-item/companion"));
    expect(success(await f.store.version())).toBe(before);
    success(await f.store.write({ action: "put", reference: companion("scratch/extra-beta.md"), content, expected: null, provenance: testProvenance }));
    expect(success(await f.reopen().read({ reference: companion("scratch/extra-beta.md") })).content).toBe(content);
  });

  it("refuses the owner metadata basename at the root and admits the same basename below scratch", async () => {
    const { f, primary } = await fixture(layout);
    const owner = primary.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected the allocated work-item UID");
    const basename = `metadata-${owner.uid}.json`;
    const companion = (key: string) => RecordReferenceSchema.parse({ kind: "work-item/companion", owner, key });
    const before = success(await f.store.version());
    expect(await f.store.write({ action: "put", reference: companion(basename), content, expected: null, provenance: testProvenance }))
      .toMatchObject(refused("reserved owner metadata"));
    expect(success(await f.store.version())).toBe(before);
    success(await f.store.write({ action: "put", reference: companion(`scratch/${basename}`), content, expected: null, provenance: testProvenance }));
    expect(success(await f.reopen().read({ reference: companion(`scratch/${basename}`) })).content).toBe(content);
  });
});
