import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, HistoryRefSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("fetches a large exact history selection below the native argv ceiling in %s", async layout => {
  const h = await refSyncFixture(layout), made = [];
  for (let i = 0; i < 16; i += 1) {
    const name = `retired-${i}`, item = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const owner = item.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected minted work item");
    const current = success(await h.a.store.read({ reference: item.reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", expected: null, reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner }),
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] })) },
      { action: "remove", reference: item.reference, expected: current.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    made.push({ reference: item.reference, history: HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`), content: makeMetaFixture(name) });
  }
  const published = success(await h.a.store.push());
  expect(published.publishes.every(row => row.status !== "failed")).toBe(true);
  const store = createRefStore({ ...h.b.ports, exec: (command, args, options) => {
    if (args.includes("fetch") && args.join(" ").length > 1800) throw new GitProcessError({ command, args,
      kind: "spawn-failure", cause: Object.assign(new Error("Native fixture command-line ceiling"), { code: "E2BIG" }) });
    return h.b.ports.exec(command, args, options);
  } });
  const pulled = success(await store.pull({ history: made.map(row => row.history) }));
  expect(pulled.pulls.every(row => row.status !== "failed"), JSON.stringify(pulled)).toBe(true);
  for (const item of made) expect(success(await store.history({ reference: item.reference })).map(row => row.content)).toContain(item.content);
  expect(success(await store.pull({ history: made.map(row => row.history) })).pulls.every(row => row.status !== "failed")).toBe(true);
}, 90_000);
