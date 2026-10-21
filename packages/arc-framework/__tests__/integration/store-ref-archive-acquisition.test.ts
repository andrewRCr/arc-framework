/** Archived point operations avoid reading or parsing unrelated owners' prose. */
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const olderQuarter = ArchiveQuarterSchema.parse("2025-q4");
const targetQuarter = ArchiveQuarterSchema.parse("2026-q1");

async function fixture(layout: "default" | "separate") {
  let parsedBytes = 0;
  const check: WriteCheck = async ({ reference, prior, next, before, after }) => {
    if (!prior || !next) return [];
    expect(success(await before.read({ reference })).content).toBe(prior.content);
    expect(success(await after.read({ reference })).content).toBe(next.content);
    return [];
  };
  const f = await createRefFixture({ "work-item/meta": {
    parser: content => { parsedBytes += Buffer.byteLength(content); return { success: true, data: { content } }; }, check,
  } }, layout);
  const other = await seed(f, f.reference("work-item/meta", "unrelated"), "Unrelated prose.\n".repeat(16_384),
    { kind: "completed", quarter: olderQuarter });
  const target = await seed(f, f.reference("work-item/meta", "target"), "Target prose.\n",
    { kind: "completed", quarter: targetQuarter });
  const companion = RecordReferenceSchema.parse({ owner: other.reference.owner, kind: "work-item/companion", key: "large.md" });
  success(await f.store.write({ action: "put", reference: companion, expected: null, content: "Unrelated companion.\n".repeat(16_384),
    provenance: { verb: "merge", lifecycleAction: "test" } }));
  let readBytes = 0;
  const store = createRefStore({ ...f.ports, rawExec: async (...args) => {
    const result = await f.ports.rawExec(...args);
    readBytes += result.stdout.byteLength;
    return result;
  } });
  return { store, target, other, companion,
    reset: () => { readBytes = 0; parsedBytes = 0; },
    costs: () => ({ readBytes, parsedBytes }) };
}

describe.each(["default", "separate"] as const)("archived acquisition in %s layout", layout => {
  it("reads one UID without acquiring unrelated archive prose", async () => {
    const f = await fixture(layout);
    f.reset();
    expect(success(await f.store.read({ reference: f.target.reference }))).toEqual(f.target);
    expect(f.costs().readBytes).toBeLessThan(16_384);
  });

  it("checks one archived update without parsing unrelated archive prose", async () => {
    const f = await fixture(layout);
    f.reset();
    const result = success(await f.store.write({ action: "put", reference: f.target.reference, expected: f.target.version,
      content: "Updated target.\n", placement: { kind: "completed", quarter: targetQuarter },
      provenance: { verb: "merge", lifecycleAction: "test" } }));
    expect(f.costs().parsedBytes).toBeLessThan(16_384);
    expect(success(await f.store.read({ reference: result.reference }))).toMatchObject({ content: "Updated target.\n", version: result.version });
    expect(success(await f.store.read({ reference: f.other.reference }))).toEqual(f.other);
    expect(success(await f.store.read({ reference: f.companion })).content).toBe("Unrelated companion.\n".repeat(16_384));
  });
});
