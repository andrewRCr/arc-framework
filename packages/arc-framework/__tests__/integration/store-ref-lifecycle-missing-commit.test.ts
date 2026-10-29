/** Lifecycle acquisition holds missing item roots and quarter repair proofs before interpreting end evidence. */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema, PushResultSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("missing lifecycle objects in %s", layout => {
  it.each((["item-tip", "item-parent", "quarter-tip", "held-history"] as const).flatMap(damage =>
    (["pull", "push"] as const).map(operation => ({ damage, operation }))))(
    "holds $damage before $operation lifecycle decisions and resumes after restoration", async ({ damage, operation }) => {
    const h = await refSyncFixture(layout), provenance = { verb: "edit", lifecycleAction: "save" };
    const owners = [];
    for (const name of ["prior-archive", "pending-item"]) owners.push(success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } })));
    const [prior, pending] = owners;
    if (!prior || !pending) throw new Error("Expected both created owners");
    const quarter = ArchiveQuarterSchema.parse("2026-q4"), archive = `refs/arc/archive/${quarter}`;
    const before = success(await h.a.store.read({ reference: prior.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version, content: before.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    success(await h.b.store.pull({ history: [HistoryRefSchema.parse(expandStoredPath(prior.reference).ref.replace("refs/arc/", "refs/arc/history/"))] }));
    const companion = RecordReferenceSchema.parse({ kind: "work-item/companion", key: "pending", owner: pending.reference.owner });
    success(await h.b.store.write({ action: "put", reference: companion, expected: null, content: "Own pending companion.\n", provenance }));
    const live = expandStoredPath(pending.reference).ref;
    const original = success(await h.a.store.read({ reference: pending.reference }));
    success(await h.a.store.write({ action: "put", reference: original.reference, expected: original.version,
      content: `${original.content}\nIntermediate edit.\n`, placement: original.placement, provenance }));
    const parent = (await h.a.git(["rev-parse", live])).stdout.trim();
    const middle = success(await h.a.store.read({ reference: pending.reference }));
    const content = `${original.content}\nPublished edit.\n`;
    success(await h.a.store.write({ action: "put", reference: middle.reference, expected: middle.version, content,
      placement: damage === "quarter-tip" ? { kind: "completed", quarter } : middle.placement, provenance }));
    const priorHistory = expandStoredPath(prior.reference).ref.replace("refs/arc/", "refs/arc/history/");
    const removed = damage === "item-parent" ? parent : (await h.a.git(["rev-parse", damage === "quarter-tip" ? archive
      : damage === "held-history" ? priorHistory : live])).stdout.trim();
    const independent = RecordReferenceSchema.parse({ kind: "personal/document", key: "independent.md", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content: "Independent publication.\n", provenance }));
    success(await h.a.store.push());
    const object = join(h.b.root, ".git", ...layout === "separate" ? ["arc", "store"] : [], "objects", removed.slice(0, 2), removed.slice(2));
    let saved: Buffer | undefined;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (!saved && args.includes("fetch")) { saved = await readFile(object); await unlink(object); }
      return result;
    } });
    try {
      const result = success(await store[operation]());
      expect(result.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt",
        ref: damage === "held-history" ? priorHistory.replace("refs/arc/history/", "refs/arc/") : live }));
      if (operation === "push" && damage !== "held-history") expect(PushResultSchema.parse(result).publishes)
        .toContainEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "refused" }) }));
      expect(success(await store.read({ reference: companion })).content).toBe("Own pending companion.\n");
      expect(success(await store.read({ reference: independent })).content).toBe("Independent publication.\n");
    } finally { if (saved) await writeFile(object, saved, { mode: 0o444 }); }
    const retried = success(await store[operation]());
    expect(retried.pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    if (operation === "push") expect(PushResultSchema.parse(retried).publishes.every(outcome => outcome.status !== "failed"), JSON.stringify(retried)).toBe(true);
    expect(success(await store.read({ reference: pending.reference }))).toMatchObject({ content,
      placement: { kind: damage === "quarter-tip" ? "completed" : "active" } });
    expect(success(await store.read({ reference: companion })).content).toBe("Own pending companion.\n");
  }, 60_000);
});
