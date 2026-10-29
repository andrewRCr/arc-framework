import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

describe.each(["default", "separate"] as const)("readable rejected content in %s", layout => {
  it.each((["work-item/companion", "review/evidence"] as const).flatMap(kind =>
    [false, true].map(archived => ({ kind, archived }))))("reads $kind without parsed fields, archived: $archived", async ({ kind, archived }) => {
    let target: RecordReference | undefined;
    const rejected = kind === "review/evidence" ? '{"rejected":true}' : "Readable rejected text.\n";
    const accepted = kind === "review/evidence" ? '{"accepted":true}' : "Accepted text.\n";
    const f = await createRefFixture({ [kind]: { parser: (content: string) => content === accepted
      ? { success: true, data: { accepted: true } } : { success: false, error: "Parser rejects this readable version." } },
    "personal/document": { check: async ({ before, after }) => {
      if (!target) return [];
      for (const view of [before, after]) {
        const read = await view.read({ reference: target });
        if (read.status !== "ok" || read.result.content !== rejected || Object.hasOwn(read.result, "fields")) return [
          { rule: "readable-check-view", condition: "The captured read did not retain readable rejected bytes without fields.", remedy: { text: "Restore point-read semantics." } },
        ];
      }
      return [];
    } } }, layout);
    const owner = await seed(f, f.reference("work-item/meta"));
    const reference = RecordReferenceSchema.parse({ kind, owner: owner.reference.owner, key: "readable" });
    await seed(f, reference, accepted);
    const home = expandStoredPath(reference), gitDir = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const tip = (await f.ports.exec("git", [...gitDir, "rev-parse", home.ref], { cwd: f.root })).stdout.trim();
    const entries = await capturedEntries(f, home.ref);
    await plantRef(f.root, home.ref, entries.map(entry => entry.path === home.path ? { path: entry.path, content: rejected } : entry),
      { parents: [tip], gitDir: f.gitDir });
    if (archived) {
      const primary = success(await f.store.read({ reference: owner.reference }));
      success(await f.store.write({ action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    }
    const saved = await f.settle();
    for (const asOf of [undefined, saved]) {
      const record = success(await f.store.read({ reference, asOf }));
      expect(record.content).toBe(rejected);
      expect(Object.hasOwn(record, "fields")).toBe(false);
      const listing = success(await f.store.list({ family: kind === "review/evidence" ? "review" : "work-item", asOf }));
      expect(listing).toMatchObject({ status: "complete", missed: true,
        diagnostics: expect.arrayContaining([expect.objectContaining({ kind: "malformed", condition: "Parser rejects this readable version." })]) });
    }
    target = reference;
    await seed(f, f.reference("personal/document"), "A check reads the captured target.\n");
    target = undefined;
    const current = success(await f.store.read({ reference })), beforeInvalidWrite = await f.settle();
    expect(await f.store.write({ action: "put", reference, expected: current.version, content: rejected,
      provenance: { verb: "save", lifecycleAction: "save" } })).toMatchObject({ status: "refused" });
    expect(await f.settle()).toBe(beforeInvalidWrite);
    success(await f.store.write({ action: "put", reference, expected: current.version, content: accepted,
      provenance: { verb: "save", lifecycleAction: "save" } }));
    expect(success(await f.store.read({ reference })).fields).toEqual({ accepted: true });
    expect(success(await f.store.read({ reference, asOf: saved })).content).toBe(rejected);
  }, 60_000);
});
