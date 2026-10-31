/** Archived point operations avoid reading or parsing unrelated owners' prose. */
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const olderQuarter = ArchiveQuarterSchema.parse("2025-q4");
const targetQuarter = ArchiveQuarterSchema.parse("2026-q1");

async function fixture(layout: "default" | "separate", inventory = false) {
  let parsedBytes = 0;
  const check: WriteCheck = async ({ reference, prior, next, before, after }) => {
    if (!prior || !next) return [];
    expect(success(await before.read({ reference })).content).toBe(prior.content);
    expect(success(await after.read({ reference })).content).toBe(next.content);
    if (inventory) {
      const registry = success(await before.list({ family: "project-registry", kind: "project-registry/identity" }));
      expect(registry).toMatchObject({ status: "complete", diagnostics: [], records: [
        { reference: { kind: "project-registry/identity" } },
      ] });
      const items = success(await after.list({ family: "work-item", kind: "work-item/meta", filter: { locations: ["completed"] } }));
      expect(items).toMatchObject({ status: "complete", diagnostics: [] });
      if (items.status !== "complete") throw new Error("The check inventory is incomplete");
      expect(items.records.map(({ reference }) => reference.owner.name).sort()).toEqual(["work-item-target", "work-item-unrelated"]);
    }
    return [];
  };
  const f = await createRefFixture({ "work-item/meta": {
    parser: content => { parsedBytes += Buffer.byteLength(content); return { success: true, data: { content } }; }, check,
  } }, layout);
  await seed(f, f.reference("project-registry/identity"));
  const other = await seed(f, f.reference("work-item/meta", "unrelated"), "Unrelated prose.\n".repeat(16_384),
    { kind: "completed", quarter: olderQuarter });
  const target = await seed(f, f.reference("work-item/meta", "target"), "Target prose.\n",
    { kind: "completed", quarter: targetQuarter });
  const companion = RecordReferenceSchema.parse({ owner: other.reference.owner, kind: "work-item/companion", key: "large.md" });
  success(await f.store.write({ action: "put", reference: companion, expected: null, content: "Unrelated companion.\n".repeat(16_384),
    provenance: { verb: "merge", lifecycleAction: "test" } }));
  let readBytes = 0;
  let processes = 0;
  const acquisitions = new Map<string, number>();
  const store = createRefStore({ ...f.ports, rawExec: async (...args) => {
    processes += 1;
    if (args[0].includes("--batch") && args[1]?.input) {
      for (const query of new TextDecoder().decode(args[1].input).trim().split("\n")) {
        if (/^[0-9a-f]{40}(?:\^\{tree\})?$/u.test(query)) acquisitions.set(query, (acquisitions.get(query) ?? 0) + 1);
      }
    }
    const result = await f.ports.rawExec(...args);
    readBytes += result.stdout.byteLength;
    return result;
  }, exec: async (...args) => { processes += 1; return f.ports.exec(...args); },
  execInput: async (...args) => { processes += 1; return f.ports.execInput(...args); } });
  return { store, target, other, companion,
    reset: () => { readBytes = 0; parsedBytes = 0; processes = 0; acquisitions.clear(); },
    costs: () => ({ readBytes, parsedBytes, processes }), acquisitions };
}

describe.each(["default", "separate"] as const)("archived acquisition in %s layout", layout => {
  it("materializes complete inventories after UID-qualified check reads", async () => {
    const f = await fixture(layout, true);
    const result = success(await f.store.write({ action: "put", reference: f.target.reference, expected: f.target.version,
      content: "Inventory still complete.\n", placement: { kind: "completed", quarter: targetQuarter },
      provenance: { verb: "merge", lifecycleAction: "test" } }));
    expect(success(await f.store.read({ reference: result.reference }))).toMatchObject({
      content: "Inventory still complete.\n", version: result.version,
    });
    expect(success(await f.store.read({ reference: f.other.reference }))).toEqual(f.other);
  });

  it("reacquires physical objects on a later write and continues after repair", async () => {
    const f = await createRefFixture({ "work-item/meta": {
      parser: content => ({ success: true, data: { content } }),
      check: async () => [],
    } }, layout);
    const target = await seed(f, f.reference("work-item/meta", "repair"), "Initial physical content.\n",
      { kind: "completed", quarter: targetQuarter });
    const input = { action: "put" as const, reference: target.reference, expected: target.version,
      content: "Accepted physical content.\n", placement: { kind: "completed" as const, quarter: targetQuarter },
      provenance: { verb: "merge", lifecycleAction: "test" } };
    const accepted = success(await f.store.write(input));
    if (!accepted.version) throw new Error("The accepted put has no record version");
    const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = new TextDecoder().decode((await f.ports.rawExec([...scope, "hash-object", "--stdin"],
      { input: new TextEncoder().encode(input.content) })).stdout).trim();
    const path = join(f.gitDir ?? join(f.root, ".git"), "objects", oid.slice(0, 2), oid.slice(2));
    const bytes = await readFile(path);
    await rm(path);
    const next = { ...input, expected: accepted.version, content: "Recovered physical content.\n" };
    expect(await f.store.write(next)).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
    await writeFile(path, bytes);
    const recovered = success(await f.store.write(next));
    expect(success(await f.store.read({ reference: recovered.reference }))).toMatchObject({ content: next.content, version: recovered.version });
  });

  it("acquires each immutable object once within a completed write attempt", async () => {
    const f = await fixture(layout);
    f.reset();
    const result = success(await f.store.write({ action: "put", reference: f.target.reference, expected: f.target.version,
      content: "One acquired before view.\n", placement: { kind: "completed", quarter: targetQuarter },
      provenance: { verb: "merge", lifecycleAction: "test" } }));
    expect([...f.acquisitions].filter(([, count]) => count > 1)).toEqual([]);
    expect(f.costs().processes).toBeLessThanOrEqual(layout === "default" ? 18 : 20);
    expect(success(await f.store.read({ reference: result.reference }))).toMatchObject({ content: "One acquired before view.\n", version: result.version });
    expect(success(await f.store.read({ reference: f.other.reference }))).toEqual(f.other);
  });

  it("reads one UID without acquiring unrelated archive prose", async () => {
    const f = await fixture(layout);
    f.reset();
    expect(success(await f.store.read({ reference: f.target.reference }))).toEqual(f.target);
    expect(f.costs().readBytes).toBeLessThan(16_384);
  });

  it("checks one archived update without acquiring or parsing unrelated archive prose", async () => {
    const f = await fixture(layout);
    f.reset();
    const result = success(await f.store.write({ action: "put", reference: f.target.reference, expected: f.target.version,
      content: "Updated target.\n", placement: { kind: "completed", quarter: targetQuarter },
      provenance: { verb: "merge", lifecycleAction: "test" } }));
    expect(f.costs().parsedBytes).toBeLessThan(16_384);
    expect(f.costs().readBytes).toBeLessThan(16_384);
    expect(success(await f.store.read({ reference: result.reference }))).toMatchObject({ content: "Updated target.\n", version: result.version });
    expect(success(await f.store.read({ reference: f.other.reference }))).toEqual(f.other);
    expect(success(await f.store.read({ reference: f.companion })).content).toBe("Unrelated companion.\n".repeat(16_384));
  });
});
