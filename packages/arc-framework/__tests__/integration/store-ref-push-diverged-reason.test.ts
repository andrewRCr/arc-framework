/** A retained history-divergence notice explains exclusion of a pending live batch. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "save", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("diverged pending publication in %s", layout => {
  it("keeps the divergence remedy when the pending-end notice was suppressed", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "diverged-end" }, kind: "work-item/meta" }),
      content: makeMetaFixture("diverged-end"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "pending.md" });
    success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published personal.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const live = expandStoredPath(made.reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
    const original = (await h.b.git(["rev-parse", live])).stdout.trim();
    const work = success(await h.b.store.read({ reference: made.reference }));
    const document = success(await h.b.store.read({ reference: personal }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: work.reference, expected: work.version, content: `${work.content}\nPending work.\n`, placement: work.placement },
      { action: "put", reference: personal, expected: document.version, content: "Pending personal.\n" },
    ], provenance }));
    const peer = success(await h.a.store.read({ reference: made.reference }));
    const quarter = ArchiveQuarterSchema.parse("2026-q4"), archive = `refs/arc/archive/${quarter}`;
    success(await h.a.store.write({ action: "put", reference: peer.reference, expected: peer.version, content: peer.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    const retained = (await h.a.git(["rev-parse", history])).stdout.trim(), suffix = history.slice("refs/arc/".length);
    // A holding clone restores genuine end evidence before reconciling its still-unpublished live batch.
    await h.b.git(["fetch", "--atomic", "--refmap=", "--no-tags", h.remoteName,
      `${history}:${history}`, `${history}:refs/arc-remotes/${h.remoteName}/${suffix}`,
      `${history}:refs/arc/tmp/seen/${h.remoteName}/${suffix}`, `${archive}:${archive}`,
      `${archive}:refs/arc-remotes/${h.remoteName}/archive/${quarter}`, `${archive}:refs/arc/tmp/seen/${h.remoteName}/archive/${quarter}`]);
    await h.remote("git", ["update-ref", history, original, retained]);
    const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent of the diverged history.\n";
    success(await h.b.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
    const result = PushResultSchema.parse(success(await h.b.store.push()));
    const notices = result.pulls.flatMap(({ notices }) => notices);
    const divergence = notices.find(notice => notice.kind === "history-diverged" && notice.ref === history);
    expect(divergence).toBeDefined();
    if (divergence?.kind !== "history-diverged") throw new Error("Expected the rejected history rewrite");
    expect(notices.some(({ kind }) => kind === "end-pending")).toBe(false);
    for (const family of ["work-item", "personal"] as const) {
      expect(result.publishes.find(row => row.status === "failed" && row.families.includes(family))).toMatchObject({ status: "failed",
        failure: { code: "refused", condition: divergence.condition, remedy: divergence.remedy } });
    }
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    await h.b.git(["push", `--force-with-lease=${history}:${original}`, h.remoteName, `${retained}:${history}`]);
    expect(success(await h.b.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: personal })).content).toBe("Pending personal.\n");
    expect(success(await h.a.store.read({ reference: inbox })).content).toBe(content);
    expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
  }, 60_000);
});
