/** A pending end discovered after a push's pull still supplies a valid publication refusal. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createManualStepBarrier } from "../helpers/multi-clone.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "save", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("pending publication reasons in %s", layout => {
  it("supplies the history-restoration remedy when another pull discovers the pending end", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "pending-end" }, kind: "work-item/meta" }),
      content: makeMetaFixture("pending-end"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "pending.md" });
    success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published personal.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const work = success(await h.b.store.read({ reference: made.reference }));
    const document = success(await h.b.store.read({ reference: personal }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: work.reference, expected: work.version, content: `${work.content}\nPending work.\n`, placement: work.placement },
      { action: "put", reference: personal, expected: document.version, content: "Pending personal.\n" },
    ], provenance }));
    const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent of the pending end.\n";
    success(await h.b.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
    const live = expandStoredPath(made.reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
    const personalRef = expandStoredPath(personal).ref, barrier = createManualStepBarrier();
    let personalLocks = 0;
    const publisher = createRefStore({ ...h.b.ports, lock: async (name, wait) => {
      // The initial pull merges personal once; pause before the push listing takes its own lock.
      if (name === personalRef && ++personalLocks === 2) await barrier.arrive();
      return h.b.ports.lock(name, wait);
    } });
    const pushing = publisher.push();
    let retained: string;
    try {
      await Promise.race([barrier.reached, pushing.then(() => { throw new Error("Push completed before the listing barrier"); })]);
      const peer = success(await h.a.store.read({ reference: made.reference }));
      success(await h.a.store.write({ action: "put", reference: peer.reference, expected: peer.version, content: peer.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
        provenance: { verb: "archive", lifecycleAction: "archive" } }));
      success(await h.a.store.push());
      retained = (await h.a.git(["rev-parse", history])).stdout.trim();
      await h.remote("git", ["update-ref", "-d", history]);
      const concurrent = success(await h.b.store.pull());
      expect(concurrent.pulls.flatMap(({ notices }) => notices))
        .toContainEqual(expect.objectContaining({ kind: "end-pending", ref: history }));
      barrier.release();
      const raw = success(await pushing), parsed = PushResultSchema.safeParse(raw);
      expect(parsed.success, JSON.stringify(raw)).toBe(true);
      if (!parsed.success) throw new Error("The pending publication result must satisfy its public schema");
      const result = parsed.data;
      expect(result.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
      for (const family of ["work-item", "personal"] as const) {
        expect(result.publishes.find(({ families }) => families.includes(family))).toMatchObject({ status: "failed",
          failure: { code: "refused", condition: expect.stringContaining("end record is present"),
            remedy: { text: expect.stringContaining(history) } } });
      }
      expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    } finally {
      barrier.release(); await Promise.allSettled([pushing]);
    }
    expect(retained).not.toBe("");
    await h.a.git(["push", h.remoteName, `${retained}:${history}`]);
    expect(success(await publisher.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: personal })).content).toBe("Pending personal.\n");
    expect(success(await h.a.store.read({ reference: inbox })).content).toBe(content);
    expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
  }, 60_000);
});
