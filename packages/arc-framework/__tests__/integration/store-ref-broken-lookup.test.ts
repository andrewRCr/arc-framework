import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema, type LookupInput } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";

const repository = "repo", sha = "a".repeat(40), copyKey = `v1:${"b".repeat(64)}:${"c".repeat(64)}`;

async function brokenScan(damage: "metadata" | "root") {
  const f = await createRefFixture();
  const broken = await seed(f, f.reference("work-item/meta", "broken"));
  const readable = await seed(f, f.reference("work-item/meta", "readable"), undefined, { kind: "active" }, {
    taskCaptures: { "1.1": [{ repository, sha, copyKey }] },
    branches: [{ repository, ref: "feat/readable", linkedAs: "created", excluded: [] }],
  });
  if (broken.reference.owner.type !== "work-item") throw new Error("Expected work-item owner");
  const ref = `refs/arc/work/${broken.reference.owner.uid}`;
  const git = makeGitExec(f.root);
  const parent = (await git("git", ["rev-parse", ref])).stdout;
  const planted = await plantRef(f.root, ref, [{ path: `meta-${broken.reference.owner.name}.md`, content: broken.content }], { parents: [parent] });
  if (damage === "root") await removeLooseObject(f.root, planted.tree);
  return { ...f, broken, readable, ref, tip: planted.tip };
}

describe("lookup with an unreadable item ref", () => {
  // These outcomes share one captured scan and its precedence decision.
  it.each(["metadata", "root"] as const)("answers readable highest-tier matches despite %s damage", async (damage) => {
    const f = await brokenScan(damage);
    const slug = { kind: "slug" as const, slug: SlugSchema.parse(f.readable.reference.owner.name) };
    expect(success(await f.store.lookup(slug))).toEqual({ reference: f.readable.reference });
    expect(success(await f.store.lookup({ kind: "commit", repository, sha, copyKey }))).toEqual({ reference: f.readable.reference, taskIds: ["1.1"] });
    expect(success(await f.store.lookup({ kind: "ref", repository, ref: "feat/readable" }))).toEqual({ reference: f.readable.reference });
    const named = RecordReferenceSchema.parse({ ...f.readable.reference, owner: { type: "work-item", name: f.readable.reference.owner.name } });
    expect(success(await f.store.read({ reference: named })).reference).toEqual(f.readable.reference);
    const listed = success(await f.store.list({ family: "work-item" }));
    expect(listed).toMatchObject({ status: "complete", missed: true, records: [expect.objectContaining({ reference: f.readable.reference })],
      diagnostics: [{ kind: "unreadable", key: f.ref }] });
    const version = success(await f.store.version());
    expect((await makeGitExec(f.root)("git", ["rev-parse", `${version}:work/${f.ref.split("/").at(-1)}`])).stdout).toBe(f.tip);
  });

  it.each(["metadata", "root"] as const)("refuses when %s damage could hide a better answer", async (damage) => {
    const f = await brokenScan(damage);
    const inputs: LookupInput[] = [
      { kind: "slug", slug: SlugSchema.parse(f.broken.reference.owner.name) },
      { kind: "commit", repository, sha: "d".repeat(40), copyKey },
      { kind: "ref", repository, ref: "feat/unknown" },
      { kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse("unknown") } },
    ];
    for (const input of inputs) expect(await f.store.lookup(input)).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: f.ref } });
  });
  it("refuses a readable former-name match when the skipped owner could hold the current name", async () => {
    const f = await brokenScan("metadata"), git = makeGitExec(f.root);
    if (f.readable.reference.owner.type !== "work-item") throw new Error("Expected work-item owner");
    const ref = `refs/arc/work/${f.readable.reference.owner.uid}`, path = `metadata-${f.readable.reference.owner.uid}.json`;
    const parent = (await git("git", ["rev-parse", ref])).stdout;
    const metadata = JSON.parse((await git("git", ["show", `${ref}:${path}`])).stdout) as Record<string, unknown>;
    metadata.formerSlugs = ["previous"];
    await plantRef(f.root, ref, [{ path, content: JSON.stringify(metadata) },
      { path: `meta-${f.readable.reference.owner.name}.md`, content: f.readable.content }], { parents: [parent] });
    const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "previous" } });
    for (const result of [await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("previous") }), await f.store.read({ reference }),
      await f.store.history({ reference }), await f.store.list({ family: "work-item", owner: reference.owner })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: f.ref } });
    }
  });

  it("refuses a new or renamed namespace claim while another live owner cannot be read", async () => {
    const f = await brokenScan("metadata");
    const renamed = RecordReferenceSchema.parse({ ...f.readable.reference, owner: { ...f.readable.reference.owner, name: "renamed" } });
    expect(await f.store.write({ ...update(f, f.readable), reference: renamed })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: f.ref } });
    const fresh = f.reference("work-item/meta", "fresh");
    expect(await f.store.write({ action: "put", reference: fresh, content: f.content(fresh), expected: null,
      placement: { kind: "active" }, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: f.ref } });
    expect(success(await f.store.read({ reference: f.readable.reference })).version).toBe(f.readable.version);
  });

  it("resolves registry lineage independently while typed names still respect live-owner precedence", async () => {
    const f = await brokenScan("metadata");
    const uid = "00000000-0000-4000-8000-000000000099";
    const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "origin", uid } });
    await plantRef(f.root, "refs/arc/project/registry", [
      { path: "metadata-registry.json", content: JSON.stringify({ formatVersion: 1, formats: {}, lineage: { [uid]: "origin" } }) },
      { path: `lineage/${uid}.json`, content: JSON.stringify({ schemaVersion: 2, origin: { name: "origin", uid }, kind: "abandon", successors: [], incoming: [] }) },
    ]);
    expect(success(await f.store.lookup({ kind: "lineage", origin: SlugSchema.parse("origin") }))).toEqual({ reference });
    expect(success(await f.store.read({ reference })).reference).toEqual(reference);
    const named = RecordReferenceSchema.parse({ kind: reference.kind, owner: { type: "work-item", name: "origin" } });
    expect(await f.store.read({ reference: named })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: f.ref } });
  });

});
