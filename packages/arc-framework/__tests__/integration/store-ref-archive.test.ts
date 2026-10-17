import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update, mutationOf } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { META_REGISTRATION } from "../../src/lib/store/kinds/meta/registration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { randomUUID } from "node:crypto";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { join } from "node:path";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

describe("local ref archives", () => {
  it("commits the final records, copies their exact blobs, and moves the live ref into history atomically", async () => {
    const f = await createRefFixture();
    const git = makeGitExec(f.root);
    const primary = await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/companion"));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
    const live = `refs/arc/work/${uid}`, history = `refs/arc/history/work/${uid}`;
    const previous = (await git("git", ["rev-parse", live])).stdout.trim();
    const result = success(await f.store.batch({ writes: [
      mutationOf({ ...update(f, primary), placement: { kind: "completed", quarter } }), mutationOf(update(f, companion)),
    ], provenance: { ...testProvenance, verb: "archive" } }));
    expect((await git("git", ["for-each-ref", "--format=%(refname)", live])).stdout.trim()).toBe("");
    const tip = (await git("git", ["rev-parse", history])).stdout.trim();
    expect((await git("git", ["rev-parse", `${tip}^`])).stdout.trim()).toBe(previous);
    const folder = `01_${primary.reference.owner.name}`;
    for (const path of [`meta-${primary.reference.owner.name}.md`, `one-${primary.reference.owner.name}.md`, `metadata-${uid}.json`]) {
      expect((await git("git", ["rev-parse", `refs/arc/archive/${quarter}:${folder}/${path}`])).stdout.trim())
        .toBe((await git("git", ["rev-parse", `${history}:${path}`])).stdout.trim());
    }
    const metadata = JSON.parse((await git("git", ["show", `${history}:metadata-${uid}.json`])).stdout) as unknown;
    expect(metadata).toMatchObject({ endBatch: result.batchId, batch: result.batchId });
    for (const ref of [history, `refs/arc/archive/${quarter}`]) {
      expect((await git("git", ["show", "-s", "--format=%B", ref])).stdout).toContain(`Arc-Batch: ${result.batchId}`);
    }
    const archived = success(await f.store.read({ reference: primary.reference }));
    expect(archived.placement).toEqual({ kind: "completed", quarter, sequence: "01" });
    expect(archived.content).toBe(f.content(primary.reference, "changed"));
    expect(success(await f.store.read({ reference: companion.reference })).content).toBe(f.content(companion.reference, "changed"));
  });
  it("exposes assigned completed placement in check views and public listings", async () => {
    const placement = { kind: "completed" as const, quarter, sequence: "01" };
    const f = await createRefFixture({ "work-item/meta": { check: async ({ reference, writer, before, after }) => {
      if (writer.kind !== "verb" || writer.verb !== "archive") return [];
      expect(success(await before.read({ reference })).placement).toEqual({ kind: "active" });
      expect(success(await after.read({ reference })).placement).toEqual(placement);
      expect(success(await after.list({ family: "work-item", owner: reference.owner }))).toMatchObject({
        status: "complete", missed: false, records: [expect.objectContaining({ placement })],
      });
      return [];
    } } });
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter },
      provenance: { ...testProvenance, verb: "archive" } }));
    expect(success(await f.store.list({ family: "work-item", owner: primary.reference.owner }))).toMatchObject({
      status: "complete", missed: false, records: [expect.objectContaining({ placement })],
    });
  });

  it.each(["work-item/meta", "work-item/record"] as const)("creates %s directly in its archive without a live ref", async (kind) => {
    const f = await createRefFixture();
    const reference = RecordReferenceSchema.parse({ ...f.reference(kind),
      owner: { type: "work-item", name: kind === "work-item/record" ? "x".repeat(2040) : "created-completed" } });
    const created = success(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference),
      placement: { kind: "completed", quarter }, provenance: testProvenance }));
    const uid = "uid" in created.reference.owner ? created.reference.owner.uid : undefined;
    const git = makeGitExec(f.root);
    expect((await git("git", ["for-each-ref", "--format=%(refname)", `refs/arc/work/${uid}`])).stdout.trim()).toBe("");
    expect((await git("git", ["rev-parse", `refs/arc/history/work/${uid}`])).stdout.trim()).toMatch(/^[0-9a-f]{40}$/u);
    const folder = kind === "work-item/meta" ? `01_${reference.owner.name}` : `${reference.owner.name}-${uid?.slice(0, 8)}`;
    expect((await git("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout.trim()).toBe(folder);
    const read = success(await f.store.read({ reference: created.reference }));
    expect(read.version).toBe(created.version);
    expect(read.placement).toEqual(kind === "work-item/meta" ? { kind: "completed", quarter, sequence: "01" } : { kind: "completed", quarter });
    expect(read.content).toBe(f.content(reference));
  });

  it.each(["cohort", "removed-highest", "removed-gap"] as const)("numbers the current quarter after %s", async (scenario) => {
    const f = await createRefFixture();
    const ref = `refs/arc/archive/${quarter}`;
    const cohort = scenario === "cohort";
    const older = archiveEntries("01_older", "older");
    const highest = archiveEntries(cohort ? "03b_cohort-closed" : "03_latest", cohort ? "closed" : "latest", cohort);
    const initial = await plantRef(f.root, ref, [...older, ...highest]);
    if (!cohort) await plantRef(f.root, ref, scenario === "removed-highest" ? older : highest, { parents: [initial.tip] });
    const primary = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.read({ reference: primary.reference })).placement)
      .toEqual({ kind: "completed", quarter, sequence: scenario === "removed-highest" ? "02" : "04" });
  });

  it("assigns distinct numbers to two worktrees archiving into one quarter concurrently", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta", "first"));
    const second = await seed(f, f.reference("work-item/meta", "second"));
    const linked = join(f.root, "linked");
    await makeGitExec(f.root)("git", ["worktree", "add", "--detach", linked, "HEAD"]);
    const other = createRefStore({ ...f.ports, checkoutRoot: linked });
    const results = await Promise.all([f.store.write({ ...update(f, first), placement: { kind: "completed", quarter } }),
      other.write({ ...update(f, second), placement: { kind: "completed", quarter } })]);
    for (const result of results) success(result);
    const reads = await Promise.all([first, second].map(async (record) => success(await f.store.read({ reference: record.reference }))));
    expect(reads.map(({ placement }) => placement && "sequence" in placement ? placement.sequence : null).sort()).toEqual(["01", "02"]);
  });

  it("closes an existing Errand into its unnumbered UID-suffixed folder", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/record"));
    success(await f.store.write({ ...update(f, record), placement: { kind: "completed", quarter } }));
    const uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
    expect((await makeGitExec(f.root)("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout.trim())
      .toBe(`${record.reference.owner.name}-${uid?.slice(0, 8)}`);
    expect(success(await f.store.read({ reference: record.reference })).placement).toEqual({ kind: "completed", quarter });
  });

  it("keeps anchor manifests in history and excludes them from the archive folder", async () => {
    const f = await createRefFixture({ "work-item/meta": { parser: META_REGISTRATION.parser, anchorFields: META_REGISTRATION.anchorFields } });
    const reference = f.reference("work-item/meta");
    const token = success(await f.store.version());
    const created = success(await f.store.write({ action: "put", reference, expected: null, placement: { kind: "active" },
      content: makeMetaFixture(reference.owner.name, { stateAtHandoff: token }), provenance: testProvenance }));
    const record = success(await f.store.read({ reference: created.reference }));
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
    const uid = "uid" in record.reference.owner ? record.reference.owner.uid : undefined;
    const git = makeGitExec(f.root);
    expect((await git("git", ["rev-parse", `refs/arc/history/work/${uid}:state-${uid}`])).stdout.trim()).toBe(token);
    const paths = (await git("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}:01_${reference.owner.name}`])).stdout;
    expect(paths).toContain(`metadata-${uid}.json`);
    expect(paths).not.toContain(`state-${uid}`);
    expect(success(await f.store.read({ reference: record.reference })).fields).toMatchObject({ stateAtHandoff: token });
  });

  it("refuses an unreadable quarter tree without losing its records and resumes after restoration", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta", "first"));
    success(await f.store.write({ ...update(f, first), placement: { kind: "completed", quarter } }));
    const second = await seed(f, f.reference("work-item/meta", "second"));
    const ref = `refs/arc/archive/${quarter}`;
    const tree = (await makeGitExec(f.root)("git", ["rev-parse", `${ref}^{tree}`])).stdout.trim();
    const bytes = (await f.ports.rawExec(["cat-file", "tree", tree], { cwd: f.root, objectAccess: "local-only" })).stdout;
    await removeLooseObject(f.root, tree);
    const before = success(await f.store.version());
    const write = { ...update(f, second), placement: { kind: "completed" as const, quarter } };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: ref,
      remedy: { text: expect.stringMatching(/restore|fetch/iu) } } });
    expect(success(await f.store.version())).toBe(before);
    await f.ports.rawExec(["hash-object", "-t", "tree", "-w", "--stdin"], { cwd: f.root, input: bytes, objectAccess: "local-only" });
    success(await f.store.write(write));
    for (const primary of [first, second]) expect(success(await f.store.read({ reference: primary.reference })).placement?.kind).toBe("completed");
  });

});

function archiveEntries(folder: string, slug: string, cohort = false): PlantTreeEntry[] {
  const uid = randomUUID();
  const placement = { kind: "completed", quarter };
  const metadata = { formatVersion: 1, slug, formats: {}, endBatch: "prior-end", batch: "prior-end",
    ...(cohort ? { placement } : { primary: { role: "work-item/meta", placement } }) };
  return [{ path: `${folder}/metadata-${uid}.json`, content: JSON.stringify(metadata) },
    { path: `${folder}/${cohort ? "cohort" : "meta"}-${slug}.md`, content: JSON.stringify({ kind: cohort ? "cohort/document" : "work-item/meta" }) }];
}
