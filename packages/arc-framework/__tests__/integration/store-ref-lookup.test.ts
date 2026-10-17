import { describe, expect, it } from "vitest";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefStore } from "../../src/lib/store/create.js";

const firstUid = "00000000-0000-4000-8000-000000000001";
const secondUid = "00000000-0000-4000-8000-000000000002";

async function plantOwner(root: string, uid: string, name: string, formerSlugs: string[] = [], kind: "work-item/meta" | "cohort/document" = "work-item/meta") {
  const cohort = kind === "cohort/document";
  const reference = RecordReferenceSchema.parse({ owner: { type: cohort ? "cohort" : "work-item", name, uid }, kind });
  const ref = `refs/arc/${cohort ? "cohort" : "work"}/${uid}`;
  await plantRef(root, ref, [
    { path: `metadata-${uid}.json`, content: JSON.stringify({ formatVersion: 1, formats: {}, slug: name, formerSlugs,
      ...(cohort ? {} : { primary: { role: kind, placement: { kind: "active" } } }) }) },
    { path: `${cohort ? "cohort" : "meta"}-${name}.md`, content: cohort ? `# Cohort: ${name}\n` : makeMetaFixture(name) },
  ]);
  return reference;
}

describe("lookup over live state refs", () => {
  it.each(["current", "former"])("resolves a live primary by its %s slug", async (match) => {
    const f = await createRefReadFixture();
    const reference = await plantOwner(f.root, firstUid, "alpha", ["before-alpha"]);
    const slug = SlugSchema.parse(match === "current" ? "alpha" : "before-alpha");
    expect(success(await f.store.lookup({ kind: "slug", slug }))).toEqual({ reference });
  });

  it("prefers a current live cohort slug over another owner's former slug", async () => {
    const f = await createRefReadFixture();
    await plantOwner(f.root, firstUid, "alpha", ["beta"]);
    const reference = await plantOwner(f.root, secondUid, "beta", [], "cohort/document");
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") }))).toEqual({ reference });
  });

  it("does not claim a live slug from retained metadata without its primary path", async () => {
    const f = await createRefReadFixture();
    await plantRef(f.root, `refs/arc/work/${firstUid}`, [
      { path: `metadata-${firstUid}.json`, content: JSON.stringify({ formatVersion: 1, formats: {}, slug: "alpha",
        primary: { role: "work-item/meta", placement: { kind: "active" } } }) },
      { path: "extra-alpha.md", content: "Retained companion.\n" },
    ]);
    expect(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it.each(["current", "former"])("names both owners when the highest %s-slug tier is ambiguous", async (tier) => {
    const f = await createRefReadFixture();
    const first = await plantOwner(f.root, firstUid, tier === "current" ? "shared" : "alpha", ["shared"]);
    const second = await plantOwner(f.root, secondUid, tier === "current" ? "shared" : "beta", ["shared"], "cohort/document");
    expect(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).toMatchObject({ status: "refused", refusal: {
      code: "ambiguous-match", candidates: expect.arrayContaining([first, second]),
    } });
  });

  it.each(["uid", "slug"])("resolves a lineage origin by %s from registry metadata and path presence", async (match) => {
    const f = await createRefReadFixture();
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "origin", uid: firstUid }, kind: "lineage/transition" });
    await plantRef(f.root, "refs/arc/project/registry", [
      { path: "metadata-registry.json", content: JSON.stringify({ formatVersion: 1, formats: {}, lineage: { [firstUid]: "origin", [secondUid]: "absent-origin" } }) },
      { path: `lineage/${firstUid}.json`, content: JSON.stringify({ schemaVersion: 2, origin: { name: "origin", uid: firstUid }, kind: "abandon", successors: [], incoming: [] }) },
    ]);
    expect(success(await f.store.lookup({ kind: "lineage", origin: match === "uid" ? firstUid : SlugSchema.parse("origin") }))).toEqual({ reference });
    expect(await f.store.lookup({ kind: "lineage", origin: secondUid })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it("treats a lineage UUID as its path coordinate when another origin uses that UUID as its slug", async () => {
    const f = await createRefReadFixture();
    await plantRef(f.root, "refs/arc/project/registry", [
      { path: "metadata-registry.json", content: JSON.stringify({ formatVersion: 1, formats: {}, lineage: { [firstUid]: "origin", [secondUid]: firstUid } }) },
      ...[[firstUid, "origin"], [secondUid, firstUid]].map(([uid, name]) => ({ path: `lineage/${uid}.json`,
        content: JSON.stringify({ schemaVersion: 2, origin: { uid, name }, kind: "abandon", successors: [], incoming: [] }) })),
    ]);
    expect(success(await f.store.lookup({ kind: "lineage", origin: firstUid })).reference).toEqual(RecordReferenceSchema.parse({
      owner: { type: "work-item", name: "origin", uid: firstUid }, kind: "lineage/transition",
    }));
  });

  it.each(["files", "reftable"] as const)("uses four processes, then one for unchanged tips, and reloads changed tips (%s)", async (format) => {
    const f = await createRefReadFixture(format);
    const first = await plantOwner(f.root, firstUid, "alpha");
    await plantOwner(f.root, secondUid, "beta", [], "cohort/document");
    const start = f.processes();
    expect(success(await createRefStore(f.ports).lookup({ kind: "slug", slug: SlugSchema.parse("alpha") }))).toEqual({ reference: first });
    expect(f.processes() - start).toBe(4);
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") }))).toEqual({ reference: first });
    expect(f.processes() - start).toBe(5);
    const renamed = await plantOwner(f.root, firstUid, "renamed", ["alpha"]);
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") }))).toEqual({ reference: renamed });
    expect(f.processes() - start).toBe(9);
  });

  it("does not retain a failed metadata scan after its missing object is restored at the same tip", async () => {
    const f = await createRefReadFixture();
    const reference = await plantOwner(f.root, firstUid, "alpha");
    const query = `refs/arc/work/${firstUid}:metadata-${firstUid}.json`;
    const metadata = (await f.exec("git", ["show", query])).stdout;
    const oid = (await f.exec("git", ["rev-parse", query])).stdout;
    await removeLooseObject(f.root, oid);
    const input = { kind: "slug" as const, slug: SlugSchema.parse("alpha") };
    expect(await f.store.lookup(input)).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
    await f.execInput(["hash-object", "-w", "--stdin"], metadata);
    expect(success(await f.store.lookup(input))).toEqual({ reference });
  });
});
