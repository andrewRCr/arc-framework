/** Restoring an absent completed primary owns the quarter changed by its reopen or move. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), later = ArchiveQuarterSchema.parse("2027-q1");

describe.each(["default", "separate"] as const)("restored primary provenance in %s", layout => {
  it.each(["reopen", "move"] as const)("attributes the emptied old quarter to the restoring %s", async action => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "restored-primary" }, kind: "work-item/meta" }),
      content: makeMetaFixture("restored-primary"), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const primary = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const completed = success(await h.a.store.read({ reference: primary.reference }));
    const home = expandStoredPath(completed.reference, { placement: completed.placement });
    success(await h.a.store.write({ action: "remove", reference: completed.reference, expected: completed.version,
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    expect(await h.a.store.read({ reference: completed.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const before = (await h.a.git(["ls-tree", "-r", "--name-only", home.ref])).stdout.split("\n");
    expect(before).toContain(home.metadataPath);
    expect(before).not.toContain(home.path);
    const provenance = action === "reopen" ? { verb: "reopen", lifecycleAction: "reopen" } : { verb: "archive", lifecycleAction: "archive" };
    const placement = action === "reopen" ? { kind: "active" as const } : { kind: "completed" as const, quarter: later };
    const restored = success(await h.a.store.write({ action: "put", reference: completed.reference, expected: null,
      content: completed.content, placement, provenance }));
    expect(success(await h.a.store.read({ reference: restored.reference })))
      .toMatchObject({ content: completed.content, placement });
    const after = (await h.a.git(["ls-tree", "-r", "--name-only", home.ref])).stdout.split("\n");
    expect(after.some(path => path.startsWith(home.root))).toBe(false);
    const message = (await h.a.git(["log", "-1", "--format=%B", home.ref])).stdout;
    expect(message.split("\n")[0]).toBe(`${provenance.verb} ${restored.reference.owner.name}`);
    expect(message).toContain(`Arc-Lifecycle-Action: ${provenance.lifecycleAction}`);
    if (!("uid" in restored.reference.owner)) throw new Error("A restored primary needs its stored generation");
    expect(message).toContain(`Arc-Owner: ${restored.reference.owner.uid}`);
  }, 30_000);

  it("preserves the existing physical-record priority in a mixed-owner restoring batch", async () => {
    const h = await refSyncFixture(layout);
    const start = async (name: string) => {
      const made = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
        content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
      const primary = success(await h.a.store.read({ reference: made.reference }));
      success(await h.a.store.write({ action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
      return success(await h.a.store.read({ reference: primary.reference }));
    };
    const absent = await start("restoring-owner"), existing = await start("existing-owner");
    const home = expandStoredPath(absent.reference, { placement: absent.placement });
    const companion = RecordReferenceSchema.parse({ owner: existing.reference.owner, kind: "work-item/companion", key: "kept" });
    success(await h.a.store.write({ action: "put", reference: companion, expected: null, content: "Before.\n",
      provenance: { verb: "save", lifecycleAction: "save" } }));
    success(await h.a.store.write({ action: "remove", reference: absent.reference, expected: absent.version,
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
    expect(await h.a.store.read({ reference: absent.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const current = success(await h.a.store.read({ reference: companion }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: absent.reference, expected: null, content: absent.content, placement: { kind: "active" } },
      { action: "put", reference: companion, expected: current.version, content: "After.\n" },
    ], provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    expect(success(await h.a.store.read({ reference: absent.reference })).placement).toEqual({ kind: "active" });
    expect(success(await h.a.store.read({ reference: companion })).content).toBe("After.\n");
    const message = (await h.a.git(["log", "-1", "--format=%B", home.ref])).stdout;
    expect(message.split("\n")[0]).toBe(`reopen ${existing.reference.owner.name}`);
    if (!("uid" in existing.reference.owner)) throw new Error("The existing record needs its stored generation");
    expect(message).toContain(`Arc-Owner: ${existing.reference.owner.uid}`);
  }, 30_000);
});
