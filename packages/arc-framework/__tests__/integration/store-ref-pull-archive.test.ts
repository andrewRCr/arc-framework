import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), archive = `refs/arc/archive/${quarter}`;
const provenance = { verb: "archive", lifecycleAction: "archive" };
type Client = Awaited<ReturnType<typeof refSyncFixture>>["a"];

async function close(client: Client, name: string) {
  return success(await client.store.write({ action: "put", expected: null, content: makeMetaFixture(name),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    placement: { kind: "completed", quarter }, provenance }));
}
async function publish(client: Client, remote: string) {
  const refs = (await client.git(["for-each-ref", "--format=%(refname)", "refs/arc/archive/", "refs/arc/history/"])).stdout.split("\n").filter(Boolean);
  await client.git(["push", "--atomic", remote, ...refs.map((ref) => `${ref}:${ref}`)]);
}

describe.each(["default", "separate"] as const)("archive pull merging in the %s layout", (layout) => {
  it.each(["new quarter", "existing quarter"])("renumbers unpublished folders in local order after the remote in a %s", async (basis) => {
    const h = await refSyncFixture(layout);
    const published = basis === "existing quarter" ? await close(h.a, "published") : undefined;
    if (published) { await publish(h.a, h.remoteName); success(await h.b.store.pull()); }
    const remote = await close(h.a, "remote"), first = await close(h.b, "first"), second = await close(h.b, "second");
    const incoming = (await h.a.git(["rev-parse", archive])).stdout, local = (await h.b.git(["rev-parse", archive])).stdout;
    await publish(h.a, h.remoteName);
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toEqual([]);
    const offset = published ? 1 : 0;
    for (const [record, number] of [[remote, offset + 1], [first, offset + 2], [second, offset + 3]] as const) {
      expect(success(await h.b.store.read({ reference: record.reference })).placement).toEqual({ kind: "completed", quarter,
        sequence: String(number).padStart(2, "0") });
    }
    if (published) expect(success(await h.b.store.read({ reference: published.reference })).placement)
      .toEqual({ kind: "completed", quarter, sequence: "01" });
    expect((await h.b.git(["rev-list", "--parents", "-n", "1", archive])).stdout.split(" ").slice(1)).toEqual([local, incoming]);
    expect((await h.b.git(["ls-tree", "--name-only", archive])).stdout.split("\n")).toEqual([
      ...published ? ["01_published"] : [], `${String(offset + 1).padStart(2, "0")}_remote`,
      `${String(offset + 2).padStart(2, "0")}_first`, `${String(offset + 3).padStart(2, "0")}_second`,
    ]);
  });
  it.each(["member", "next"])("moves a cohort's %s assignment with its unpublished group", async (assignment) => {
    const h = await refSyncFixture(layout);
    await close(h.a, "remote");
    const cohort = (name: string) => RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name } });
    const remoteCohort = success(await h.a.store.write({ action: "put", reference: cohort("remote-group"), expected: null,
      content: "# Remote Group\n\n**Purpose:** Retain the remote group.\n", placement: { kind: "completed", quarter }, provenance }));
    const member = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "member" } });
    const groupContent = "# Local Group\n\n**Purpose:** Retain the local group.\n";
    const group = success(await h.b.store.write({ action: "put", reference: cohort("local-group"), expected: null,
      content: groupContent, provenance }));
    const content = makeMetaFixture("member", { cohort: assignment === "member" ? "local-group" : null });
    const active = success(await h.b.store.write({ action: "put", reference: member, expected: null, content,
      placement: { kind: "active" }, provenance }));
    const local = success(await h.b.store.batch({ writes: [
      { action: "put", reference: group.reference, expected: group.version!, content: groupContent, placement: { kind: "completed", quarter } },
      { action: "put", reference: active.reference, expected: active.version!, content, placement: { kind: "completed", quarter } },
    ], provenance }));
    const localCohort = local.writes[0], localMember = local.writes[1];
    if (!localCohort || !localMember) throw new Error("Expected both archived writes");
    await publish(h.a, h.remoteName);
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: remoteCohort.reference })).placement)
      .toEqual({ kind: "completed", quarter, sequence: "02", closeout: "a" });
    expect(success(await h.b.store.read({ reference: localMember.reference })).placement)
      .toEqual({ kind: "completed", quarter, sequence: "03" });
    expect(success(await h.b.store.read({ reference: localCohort.reference })).placement)
      .toEqual({ kind: "completed", quarter, sequence: assignment === "member" ? "03" : "04", closeout: "a" });
  });

  it("groups every changed record of a merge under its one stored batch", async () => {
    const h = await refSyncFixture(layout), ref = "refs/arc/user/andrew/personal";
    const references = ["first.md", "second.md"].map((key) => RecordReferenceSchema.parse({ kind: "personal/document", key,
      owner: { type: "person", name: "andrew" } }));
    for (const reference of references) success(await h.a.store.write({ action: "put", reference, expected: null, content: "base\n", provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    for (const reference of references) {
      const base = success(await h.a.store.read({ reference }));
      success(await h.a.store.write({ action: "put", reference, expected: base.version, content: "remote\n", provenance }));
      success(await h.b.store.write({ action: "put", reference, expected: base.version, content: "local\n", provenance }));
    }
    const from = success(await h.b.store.version());
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const to = success(await h.b.store.version());
    const message = (await h.b.git(["show", "-s", "--format=%B", ref])).stdout;
    const batchId = /^Arc-Batch: (.+)$/mu.exec(message)?.[1];
    expect(batchId).toMatch(/^[0-9a-f-]{36}$/u);
    const entries = success(await h.b.store.changes({ from, to, references }));
    const merged = entries.filter(({ provenance: p }) => "verb" in p && p.verb === "sync" && p.lifecycleAction === "merge");
    expect(merged).toHaveLength(2);
    expect(merged.map(({ reference }) => reference.key).sort()).toEqual(["first.md", "second.md"]);
    for (const entry of merged) expect(entry.provenance).toMatchObject({ batchId });
  });

});
