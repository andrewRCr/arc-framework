import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { parseCohortDocument } from "../../src/lib/store/kinds/cohort/parser.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

describe("ref cohort closeout", () => {
  it("copies the final document and metadata into a numbered sidecar and moves its ref into history", async () => {
    const f = await createRefFixture();
    const cohort = await seed(f, f.reference("cohort/document"));
    const uid = "uid" in cohort.reference.owner ? cohort.reference.owner.uid : undefined;
    const live = `refs/arc/cohort/${uid}`, history = `refs/arc/history/cohort/${uid}`;
    const git = makeGitExec(f.root), parent = (await git("git", ["rev-parse", live])).stdout.trim();
    const written = success(await f.store.write({ ...update(f, cohort), placement: { kind: "completed", quarter } }));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", live])).stdout.trim()).toBe("");
    expect((await git("git", ["rev-parse", `${history}^`])).stdout.trim()).toBe(parent);
    const folder = `01a_cohort-${cohort.reference.owner.name}/`, archive = `refs/arc/archive/${quarter}`;
    for (const path of [`cohort-${cohort.reference.owner.name}.md`, `metadata-${uid}.json`]) {
      expect((await git("git", ["rev-parse", `${archive}:${folder}${path}`])).stdout).toBe((await git("git", ["rev-parse", `${history}:${path}`])).stdout);
    }
    const read = success(await f.store.read({ reference: cohort.reference }));
    expect(read).toMatchObject({ content: f.content(cohort.reference, "changed"), version: written.version,
      placement: { kind: "completed", quarter, sequence: "01", closeout: "a" } });
    expect(success(await f.store.list({ family: "cohort" }))).toMatchObject({ status: "complete", missed: false, records: [read] });
    const member = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, member), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.read({ reference: member.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "02" });
  });
  it.each(["matching members", "other cohort", "other quarter"] as const)("assigns the cohort after considering %s regardless of write order", async (mode) => {
    const f = await createRefFixture();
    const cohort = await seed(f, f.reference("cohort/document"));
    if (mode === "other quarter") {
      const prior = await seed(f, f.reference("work-item/meta", "prior"));
      success(await f.store.write({ ...update(f, prior), placement: { kind: "completed", quarter } }));
    }
    const members = await Promise.all((mode === "matching members" ? ["first", "second", "other"] : ["first"]).map(async (suffix) => {
      const reference = f.reference("work-item/meta", suffix);
      const matching = mode === "matching members" && suffix !== "other" || mode === "other quarter";
      return seed(f, reference, JSON.stringify({ ...JSON.parse(f.content(reference)), cohort: matching ? `ancestor/${cohort.reference.owner.name}` : "elsewhere" }));
    }));
    const memberQuarter = mode === "other quarter" ? ArchiveQuarterSchema.parse("2027-q1") : quarter;
    const active = mode === "matching members" ? members : members.slice(0, 1);
    success(await f.store.batch({ writes: [mutationOf({ ...update(f, cohort), placement: { kind: "completed", quarter } }),
      ...active.map((member) => mutationOf({ ...update(f, member, member.content), placement: { kind: "completed", quarter: memberQuarter } }))], provenance: testProvenance }));
    const read = success(await f.store.read({ reference: cohort.reference }));
    expect(read.placement).toEqual({ kind: "completed", quarter, sequence: "02", closeout: "a" });
    if (mode === "matching members") {
      expect(success(await f.store.read({ reference: members[2]!.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "03" });
    }
  });

  it.each(["none", "existing child", "closed child", "same batch child", "no parser"] as const)("derives closeout from parsed parent fields with %s", async (mode) => {
    const f = await createRefFixture({ "cohort/document": { parser: mode === "no parser" ? null : parseCohortDocument } });
    const parent = await seed(f, f.reference("cohort/document", "parent"), "# Parent\n");
    const child = f.reference("cohort/document", "child"), content = `# Child\n\n**Parent:** \`${parent.reference.owner.name}\`\n`;
    if (mode === "existing child" || mode === "no parser" || mode === "closed child") {
      const document = await seed(f, child, content);
      if (mode === "closed child") success(await f.store.write({ ...update(f, document, content), placement: { kind: "completed", quarter } }));
    }
    success(await f.store.batch({ writes: [mutationOf({ ...update(f, parent, parent.content), placement: { kind: "completed", quarter } }),
      ...(mode === "same batch child" ? [{ action: "put" as const, reference: child, expected: null, content }] : [])], provenance: testProvenance }));
    const letter = mode === "existing child" || mode === "same batch child" || mode === "closed child" ? "b" : "a";
    const sequence = mode === "closed child" ? "02" : "01";
    expect(success(await f.store.read({ reference: parent.reference })).placement).toEqual({ kind: "completed", quarter, sequence, closeout: letter });
    expect((await makeGitExec(f.root)("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout).toContain(`${sequence}${letter}_cohort-${parent.reference.owner.name}`);
  });

  it("closes a nested pair beside its member with the same number and distinct letters", async () => {
    const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } });
    const parent = await seed(f, f.reference("cohort/document", "parent"), "# Parent\n");
    const leaf = await seed(f, f.reference("cohort/document", "leaf"), `# Leaf\n\n**Parent:** \`${parent.reference.owner.name}\`\n`);
    const reference = f.reference("work-item/meta");
    const member = await seed(f, reference, JSON.stringify({ ...JSON.parse(f.content(reference)), cohort: `${parent.reference.owner.name}/${leaf.reference.owner.name}` }));
    success(await f.store.batch({ writes: [parent, leaf, member].map((record) => mutationOf({ ...update(f, record, record.content), placement: { kind: "completed", quarter } })), provenance: testProvenance }));
    expect(success(await f.store.read({ reference: parent.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "b" });
    expect(success(await f.store.read({ reference: leaf.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "a" });
    expect(success(await f.store.read({ reference: member.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01" });
  });

  it("closes a cohort with a maximum-size slug into a readable Git folder", async () => {
    const f = await createRefFixture();
    const reference = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "a".repeat(2040) } });
    const cohort = await seed(f, reference);
    success(await f.store.write({ ...update(f, cohort), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.read({ reference: cohort.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "a" });
    expect((await makeGitExec(f.root)("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout.trim()).toBe(`01a_cohort-${cohort.reference.owner.name}`);
  });

  it("keeps a closed cohort completed when updating its document and reads its full retained history", async () => {
    const f = await createRefFixture();
    const cohort = await seed(f, f.reference("cohort/document"));
    success(await f.store.write({ ...update(f, cohort), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: cohort.reference }));
    success(await f.store.write(update(f, closed, f.content(closed.reference, "changed-again"))));
    expect(success(await f.store.read({ reference: cohort.reference }))).toMatchObject({ content: f.content(closed.reference, "changed-again"), placement: closed.placement });
    expect(success(await f.store.history({ reference: cohort.reference })).map(({ content }) => content)).toEqual([f.content(closed.reference, "changed-again"), closed.content, cohort.content]);
  });

  it.each(["missing", "malformed"] as const)("refuses a %s child document without publishing a close and admits repair", async (mode) => {
    const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } });
    const parent = await seed(f, f.reference("cohort/document", "parent"), "# Parent\n");
    const content = `# Child\n\n**Parent:** \`${parent.reference.owner.name}\`\n`;
    const child = await seed(f, f.reference("cohort/document", "child"), content);
    const uid = "uid" in child.reference.owner ? child.reference.owner.uid : undefined;
    const live = `refs/arc/cohort/${uid}`, path = `cohort-${child.reference.owner.name}.md`, git = makeGitExec(f.root);
    const blob = (await git("git", ["rev-parse", `${live}:${path}`])).stdout.trim();
    const bytes = (await f.ports.rawExec(["cat-file", "blob", blob])).stdout;
    if (mode === "missing") await removeLooseObject(f.root, blob);
    else {
      const tip = (await git("git", ["rev-parse", live])).stdout.trim();
      await plantRef(f.root, live, (await entriesAt(f.root, live)).map((entry): PlantTreeEntry => entry.path === path
        ? { path, content: "# Child\n\n**Parent:** broken\n" } : entry), { parents: [tip] });
    }
    const before = (await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    const write = { ...update(f, parent, parent.content), placement: { kind: "completed" as const, quarter } };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: mode === "missing" ? "namespace-corrupt" : "record-malformed" } });
    expect((await git("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
    if (mode === "missing") await f.ports.rawExec(["hash-object", "-w", "--stdin"], { input: bytes });
    else {
      const damaged = success(await f.store.history({ reference: child.reference }))[0];
      if (!damaged?.version) throw new Error("Expected the damaged document's historical version");
      success(await f.store.write({ ...update(f, child, content), expected: damaged.version }));
    }
    success(await f.store.write(write));
    expect(success(await f.store.read({ reference: parent.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01", closeout: "b" });
  });

});

async function entriesAt(root: string, ref: string): Promise<PlantTreeEntry[]> {
  const { stdout } = await makeGitExec(root)("git", ["ls-tree", "-r", "-z", ref]);
  return stdout.split("\0").filter(Boolean).map((row) => {
    const match = /^100644 blob ([0-9a-f]+)\t(.*)$/su.exec(row);
    if (!match?.[1] || !match[2]) throw new Error("The fixture expects regular record blobs");
    return { path: match[2], mode: "100644", oid: match[1] };
  });
}
