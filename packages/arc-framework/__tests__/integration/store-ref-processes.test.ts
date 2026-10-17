import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { startRefWriter } from "../helpers/store/ref-process.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { OwnerIdentitySchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { readGitDirectories } from "../../src/lib/git/directories.js";

const provenance = { verb: "test-write", lifecycleAction: "edit" };
const quarter = ArchiveQuarterSchema.parse("2026-q4");
describe.each(["default", "separate"] as const)("many processes (%s)", (layout) => {
  async function fixture() {
    const f = await createRefReadFixture();
    if (layout === "separate") {
      await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
      const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/seed.md" });
      success(await f.store.write({ action: "put", reference, expected: null, content: "seed", provenance }));
    }
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs);
    return { ...f, args: layout === "separate" ? [`--git-dir=${join(commonDir, "arc", "store")}`] : [] };
  }
  it.each([1, 4])("retains four writers' 25 writes across %s surfaces", async (surfaces) => {
    const f = await fixture();
    const writers = Array.from({ length: 4 }, (_, writer) => startRefWriter(f.root,
      { mode: "burst", identity: surfaces === 1 ? "andrew" : `writer-${writer}`, writer, iterations: 25 }));
    await Promise.all(writers.map((writer) => writer.ready));
    writers.forEach((writer) => writer.resume());
    const reports = await Promise.all(writers.map((writer) => writer.result));
    for (const report of reports) {
      expect(report.outcomes).toHaveLength(25);
      expect(report.outcomes.every((outcome) => outcome.status === "ok")).toBe(true);
      expect(report.retries).toHaveLength(25);
      expect(report.retries.every((retries) => retries < 5)).toBe(true);
    }
    for (let writer = 0; writer < 4; writer += 1) {
      const name = surfaces === 1 ? "andrew" : `writer-${writer}`;
      const listing = success(await f.store.list({ family: "personal", owner: OwnerIdentitySchema.parse({ type: "person", name }) }));
      expect(listing.status).toBe("complete");
      if (listing.status !== "complete") throw new Error("Incomplete writer records");
      expect(listing.diagnostics).toEqual([]);
      for (let iteration = 0; iteration < 25; iteration += 1) {
        expect(listing.records).toContainEqual(expect.objectContaining({ content: `writer ${writer}, iteration ${iteration}\n`,
          reference: expect.objectContaining({ key: `scratch/writer-${writer}-${iteration}.md` }) }));
      }
    }
  }, 90_000);

  it.each(["archive", "abandon", "reopen", "reopen-and-archive"] as const)("never resurrects state left by a racing %s", async (action) => {
    const f = await fixture();
    const primary = success(await f.store.write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "work-item/meta",
      owner: { type: "work-item", name: "alpha" } }), expected: null, content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    const reference = RecordReferenceSchema.parse({ ...primary.reference, kind: "work-item/companion", key: "extra" });
    const original = success(await f.store.write({ action: "put", reference, expected: null, content: "before\n", provenance }));
    if (action.startsWith("reopen")) {
      const current = success(await f.store.read({ reference: primary.reference }));
      success(await f.store.write({ action: "put", reference: current.reference, expected: current.version,
        content: current.content, placement: { kind: "completed", quarter }, provenance: { ...provenance, verb: "archive" } }));
    }
    const current = success(await f.store.read({ reference: original.reference }));
    const writer = startRefWriter(f.root, { mode: "write", identity: "andrew", pause: true,
      input: { action: "put", reference: current.reference, expected: current.version, content: "after\n", provenance } });
    await writer.ready;
    const lifecycle = startRefWriter(f.root, { mode: "lifecycle", identity: "andrew", primary: primary.reference, action });
    const moved = await lifecycle.result;
    expect(moved.outcomes.every((outcome) => outcome.status === "ok")).toBe(true);
    writer.resume();
    const result = await writer.result;
    if (action === "abandon") {
      expect(result.outcomes).toMatchObject([{ status: "refused", refusal: { code: "not-found" } }]);
      expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    } else {
      expect(result.outcomes).toMatchObject([{ status: "ok" }]);
      expect(success(await f.store.read({ reference })).content).toBe("after\n");
    }
    if (primary.reference.owner.type !== "work-item") throw new Error("No work item");
    const live = `refs/arc/work/${primary.reference.owner.uid}`, history = `refs/arc/history/work/${primary.reference.owner.uid}`;
    const absent = action === "reopen" ? history : live;
    expect((await f.exec("git", [...f.args, "for-each-ref", "--format=%(refname)", absent])).stdout).toBe("");
    if (action === "abandon") expect((await f.exec("git", [...f.args, "ls-tree", "-r", history])).stdout).toBe("");
    if (action.startsWith("reopen")) {
      expect((await f.exec("git", [...f.args, "ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout).toBe("");
    }
    if (action === "reopen-and-archive") expect(success(await f.store.read({ reference })).placement).toMatchObject({ kind: "completed", quarter: "2027-q1" });
  }, 30_000);
});
