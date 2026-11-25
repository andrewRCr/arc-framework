/** Published double ends explain exclusion of their remaining atomic batch contributions. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "save", lifecycleAction: "save" };
const quarter = ArchiveQuarterSchema.parse("2026-q4"), otherQuarter = ArchiveQuarterSchema.parse("2027-q1");

describe.each(["default", "separate"] as const)("double-end publication reasons in %s", layout => {
  it("uses the item-keyed notice for an excluded completed write and its personal batch member", async () => {
    const h = await refSyncFixture(layout);
    const create = async (name: string) => success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const made = await create("double-ended"), trigger = await create("independent-active");
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "pending.md" });
    success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published personal.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version, content: before.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    const firstQuarter = (await h.a.git(["rev-parse", `refs/arc/archive/${quarter}`])).stdout.trim();
    const companion = RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "work-item/companion", key: "pending.txt" });
    const document = success(await h.a.store.read({ reference: personal }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: companion, expected: null, content: "Pending completed bytes.\n" },
      { action: "put", reference: personal, expected: document.version, content: "Pending personal.\n" },
    ], provenance }));
    const refs = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
    for (const ref of refs.filter(ref => ref !== "refs/arc/project/registry")) await h.remote("git", ["update-ref", "-d", ref]);
    const peer = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: peer.reference, expected: peer.version, content: peer.content,
      placement: { kind: "completed", quarter: otherQuarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.b.store.push());
    const live = expandStoredPath(made.reference).ref, history = HistoryRefSchema.parse(live.replace("refs/arc/", "refs/arc/history/"));
    const retained = (await h.b.git(["rev-parse", history])).stdout.trim();
    await h.remote("git", ["update-ref", "-d", history]);
    // A distinct live movement causes the listing to inspect all pending lifecycle ends.
    const active = success(await h.a.store.read({ reference: trigger.reference }));
    success(await h.a.store.write({ action: "put", reference: active.reference, expected: active.version,
      content: `${active.content}\nIndependent edit.\n`, placement: active.placement, provenance }));
    const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent of the double end.\n";
    success(await h.a.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
    const result = PushResultSchema.parse(success(await h.a.store.push()));
    const notices = result.pulls.flatMap(({ notices }) => notices);
    const ended = notices.find(notice => notice.kind === "ended-twice");
    expect(ended).toMatchObject({ kind: "ended-twice", item: made.reference.owner });
    if (ended?.kind !== "ended-twice") throw new Error("Expected independently published ends");
    expect(notices.some(({ kind }) => kind === "end-pending")).toBe(false);
    for (const family of ["work-item", "personal"] as const) {
      expect(result.publishes.find(row => row.status === "failed" && row.families.includes(family))).toMatchObject({ status: "failed",
        failure: { code: "refused", condition: ended.condition, remedy: ended.remedy } });
    }
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    await h.b.git(["push", h.remoteName, `${retained}:${history}`]);
    // Restore the first published witness before accepting the other history for a merge of both ends.
    await h.a.git(["push", h.remoteName, `${firstQuarter}:refs/arc/archive/${quarter}`]);
    const suffix = history.slice("refs/arc/".length);
    await h.a.git(["fetch", "--atomic", "--refmap=", "--no-tags", "--no-filter", h.remoteName,
      `+${history}:refs/arc-remotes/${h.remoteName}/${suffix}`, `+${history}:refs/arc/tmp/seen/${h.remoteName}/${suffix}`]);
    success(await h.a.store.pull({ history: [history] }));
    const completed = success(await h.a.store.read({ reference: made.reference }));
    const reopened = success(await h.a.store.write({ action: "put", reference: completed.reference, expected: completed.version,
      content: completed.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    const current = success(await h.a.store.read({ reference: reopened.reference }));
    success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version, content: current.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q2") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "ended-twice")).toBe(false);
    expect(success(await h.b.store.read({ reference: personal })).content).toBe("Pending personal.\n");
    expect(success(await h.b.store.read({ reference: companion })).content).toBe("Pending completed bytes.\n");
    expect(success(await h.b.store.read({ reference: inbox })).content).toBe(content);
  }, 60_000);
});
