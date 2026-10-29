/** Retired-history absence requires complete namespace evidence across every parent. */
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

async function retiredFixture(layout: "default" | "separate") {
  const f = await createRefFixture({}, layout), requested = f.reference("work-item/meta");
  const made = success(await f.store.write({ action: "put", reference: requested, expected: null,
    content: f.content(requested), placement: { kind: "active" }, provenance: testProvenance }));
  const current = success(await f.store.read({ reference: made.reference })), live = expandStoredPath(current.reference);
  const exec = makeGitExec(f.root), git = (args: string[]) => exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args]);
  const metadata = (await git(["rev-parse", `${live.ref}:${live.metadataPath}`])).stdout.trim();
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: current.reference.owner });
  success(await f.store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content: f.content(lineage) },
    { action: "remove", reference: current.reference, expected: current.version }], provenance: testProvenance }));
  return { f, current, lineage, metadata, home: expandStoredPath(current.reference, { history: true }) };
}

describe.each(["default", "separate"] as const)("record-free retired history in %s", layout => {
  it.each(["root", "chain"] as const)("reads malformed-metadata-only %s history as absent and continues with readable records", async shape => {
    const { f, current, lineage, metadata, home } = await retiredFixture(layout);
    const empty = await plantRef(f.root, home.ref, [{ path: home.metadataPath, content: "Malformed auxiliary metadata\n" }], { gitDir: f.gitDir });
    const tip = shape === "chain" ? await plantRef(f.root, home.ref, [{ path: home.manifestPath + "retained", content: "Auxiliary\n" }],
      { parents: [empty.tip], gitDir: f.gitDir }) : empty;
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found", class: "recoverable" } });
    expect(success(await f.store.read({ reference: lineage })).content).toBe(f.content(lineage));
    await plantRef(f.root, home.ref, [{ path: home.path, content: current.content }, { path: home.metadataPath, oid: metadata, mode: "100644" }],
      { parents: [tip.tip], gitDir: f.gitDir });
    expect(success(await f.store.history({ reference: current.reference })).map(({ content }) => content)).toEqual([current.content]);
  });

  it.each(["ancestor", "second-parent"] as const)("retains corruption for an undecodable real-record %s below an empty tip", async shape => {
    const { f, current, home } = await retiredFixture(layout);
    const damaged = await plantRef(f.root, home.ref, [{ path: home.path, content: current.content }], { gitDir: f.gitDir });
    const empty = await plantRef(f.root, home.ref, [{ path: home.metadataPath, content: "Auxiliary\n" }], { gitDir: f.gitDir });
    await plantRef(f.root, home.ref, [], { parents: shape === "ancestor" ? [damaged.tip] : [empty.tip, damaged.tip], gitDir: f.gitDir });
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
    // A forward empty state cannot rewrite the broken ancestor; readable replacement history can supply a usable interval.
    await plantRef(f.root, home.ref, [], { gitDir: f.gitDir });
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it("requires a missing historical tree to be restored before confirming no records", async () => {
    const { f, current, home } = await retiredFixture(layout);
    const entries = [{ path: home.metadataPath, content: "Auxiliary\n" }];
    const ancestor = await plantRef(f.root, home.ref, entries, { gitDir: f.gitDir });
    await plantRef(f.root, home.ref, [], { parents: [ancestor.tip], gitDir: f.gitDir });
    await removeLooseObject(f.root, ancestor.tree, f.gitDir);
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
    await plantRef(f.root, "refs/testing/restored-tree", entries, { gitDir: f.gitDir });
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
