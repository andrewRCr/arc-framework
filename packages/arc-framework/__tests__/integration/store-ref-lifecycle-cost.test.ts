import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema, HistoryRefSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { preparedRefSync, refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const quarters = [ArchiveQuarterSchema.parse("2026-q3"), ArchiveQuarterSchema.parse("2026-q4")];
const provenance = { verb: "save", lifecycleAction: "save" };

describe.each([4, 8])("a no-op pull with %s held archive histories", (count) => {
  it("acquires each quarter once without companion blobs and batches history traversal", async () => {
    const h = await preparedRefSync(`lifecycle-cost-${count}`, "default", async (f) => {
      const made = [];
      for (let i = 0; i < count; i += 1) {
        const item = success(await f.a.store.write({ action: "put", expected: null,
          reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: `cost-item-${i}` }, kind: "work-item/meta" }),
          content: makeMetaFixture(`cost-item-${i}`), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
        const companion = RecordReferenceSchema.parse({ owner: item.reference.owner, kind: "work-item/companion", key: "payload" });
        success(await f.a.store.write({ action: "put", expected: null, reference: companion,
          content: `Retained payload ${i}.\n${"Companion content need not be decoded to locate a folder.\n".repeat(32)}`, provenance }));
        made.push(item);
      }
      success(await f.a.store.push()); success(await f.b.store.pull());
      const writes = [];
      for (let i = 0; i < made.length; i += 1) {
        const item = made[i]; if (!item) throw new Error("Expected an archived item");
        const current = success(await f.a.store.read({ reference: item.reference }));
        const quarter = quarters[i % quarters.length]; if (!quarter) throw new Error("Expected a quarter");
        writes.push({ action: "put" as const, reference: current.reference, expected: current.version, content: current.content,
          placement: { kind: "completed" as const, quarter } });
      }
      success(await f.a.store.batch({ writes, provenance: { verb: "archive", lifecycleAction: "archive" } }));
      const histories = made.map(({ reference }) => {
        if (!("uid" in reference.owner)) throw new Error("Expected a work UID");
        return HistoryRefSchema.parse(`refs/arc/history/work/${reference.owner.uid}`);
      });
      success(await f.a.store.push()); success(await f.b.store.pull({ history: histories }));
      const companionOids = [];
      for (let i = 0; i < histories.length; i += 1) {
        const item = made[i], history = histories[i]; if (!item || !history) throw new Error("Expected a held history");
        const reference = RecordReferenceSchema.parse({ owner: item.reference.owner, kind: "work-item/companion", key: "payload" });
        const path = expandStoredPath(reference, { registry: createKindRegistry(PRODUCTION_REGISTRATIONS) }).path;
        companionOids.push((await f.b.git(["rev-parse", `${history}:${path}`])).stdout.trim());
      }
      const quarterTrees = [];
      for (const quarter of quarters) quarterTrees.push((await f.b.git(["rev-parse", `refs/arc/archive/${quarter}^{tree}`])).stdout.trim());
      return { made, histories, companionOids, quarterTrees };
    });
    let logs = 0, companionReads = 0;
    const enumerations = new Map(h.quarterTrees.map((tree) => [tree, 0]));
    const measured = createRefStore({ ...h.b.ports,
      exec: async (command, args, options) => {
        if (args.includes("log")) logs += 1;
        return h.b.ports.exec(command, args, options);
      },
      execInput: async (args, input, options) => {
        if (args.includes("log")) logs += 1;
        return h.b.ports.execInput(args, input, options);
      },
      rawExec: async (args, options) => {
        const input = new TextDecoder().decode(options?.input);
        if (args.includes("cat-file")) for (const oid of h.companionOids) {
          companionReads += input.split("\n").filter((query) => query === oid).length;
        }
        if (args.includes("diff-tree")) for (const tree of h.quarterTrees) {
          enumerations.set(tree, (enumerations.get(tree) ?? 0) + input.split("\n").filter((row) => row.endsWith(` ${tree}`)).length);
        }
        return h.b.ports.rawExec(args, options);
      },
    });
    const started = performance.now(), result = success(await measured.pull());
    const cost = { count, logs, companionReads, quarterEnumerations: [...enumerations.values()], elapsedMs: performance.now() - started };
    expect(result.pulls).toContainEqual(expect.objectContaining({ status: "noop", notices: [] }));
    expect.soft(companionReads, JSON.stringify(cost)).toBe(0);
    expect.soft([...enumerations.values()], JSON.stringify(cost)).toEqual([1, 1]);
    expect.soft(logs, JSON.stringify(cost)).toBeLessThanOrEqual(1);
    for (const item of h.made) expect(success(await h.b.store.read({ reference: item.reference })).placement?.kind).toBe("completed");
  }, 120_000);
});

it("keeps an unchanged live-only pull free of lifecycle graph walks", async () => {
  const h = await refSyncFixture();
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "live-cost" }, kind: "work-item/meta" }),
    content: makeMetaFixture("live-cost"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  let logs = 0;
  const measured = createRefStore({ ...h.b.ports,
    exec: async (command, args, options) => {
      if (args.includes("log")) logs += 1;
      return h.b.ports.exec(command, args, options);
    },
    execInput: async (args, input, options) => {
      if (args.includes("log")) logs += 1;
      return h.b.ports.execInput(args, input, options);
    },
  });
  expect(success(await measured.pull()).pulls).toContainEqual(expect.objectContaining({ status: "noop", notices: [] }));
  expect(logs).toBe(0);
  expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("active");
});
