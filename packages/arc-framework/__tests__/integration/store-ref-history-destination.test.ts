/** Live-to-history writes admit only a captured ancestor and refuse a changed locked destination. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema, type StoreRecord } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";

function liveRef(record: StoreRecord): string {
  if (!("uid" in record.reference.owner) || !record.reference.owner.uid) throw new Error("Expected stored owner UID");
  return `refs/arc/work/${record.reference.owner.uid}`;
}

it.each((["archive", "retire"] as const).flatMap(ending => (["stray", "ancestor"] as const).map(history => ({ ending, history }))))(
  "checks a $history history destination before $ending and succeeds after repair", async ({ ending, history }) => {
    const f = await createRefFixture();
    const original = await seed(f, f.reference("work-item/meta"));
    const live = liveRef(original), target = live.replace("refs/arc/", "refs/arc/history/");
    const ancestor = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
    success(await f.store.write(update(f, original)));
    const current = success(await f.store.read({ reference: original.reference }));
    const other = await seed(f, f.reference("work-item/meta", "other"));
    const stray = (await f.ports.exec("git", ["rev-parse", liveRef(other)])).stdout.trim();
    await f.ports.exec("git", ["update-ref", target, history === "ancestor" ? ancestor : stray]);
    const before = (await f.ports.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    let attempts = 0;
    const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
      if (args.includes("update-ref") && input.includes(target) && ++attempts > 1) throw new Error("Repeated a locked history CAS");
      return f.ports.execInput(args, input, options);
    } });
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: current.reference.owner });
    const run = () => ending === "archive" ? store.write({ ...update(f, current, current.content),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } })
      : store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content: f.content(lineage) },
        { action: "remove", reference: current.reference, expected: current.version }], provenance: testProvenance });
    if (history === "stray") {
      expect(await run()).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: target } });
      expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
      await f.ports.exec("git", ["update-ref", "-d", target]);
    }
    attempts = 0;
    expect(await run()).toMatchObject({ status: "ok" });
    const retained = (await f.ports.exec("git", ["rev-parse", target])).stdout.trim();
    expect(retained).not.toBe(history === "ancestor" ? ancestor : stray);
    expect((await f.ports.exec("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
  });

it("refuses a history destination changed outside its held lock and retries after repair", async () => {
  const f = await createRefFixture();
  const record = await seed(f, f.reference("work-item/meta"));
  const live = liveRef(record), history = live.replace("refs/arc/", "refs/arc/history/");
  const racedTip = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
  let raced = false, attempts = 0;
  const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
    if (args.includes("update-ref") && input.includes(history)) {
      if (++attempts > 1) throw new Error("Repeated a locked history CAS");
      if (!raced) { raced = true; await f.ports.exec("git", ["update-ref", history, racedTip]); }
    }
    return f.ports.execInput(args, input, options);
  } });
  const mutation = { ...update(f, record, record.content), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
  expect(await store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: history } });
  expect((await f.ports.exec("git", ["rev-parse", history])).stdout.trim()).toBe(racedTip);
  expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
  await f.ports.exec("git", ["update-ref", "-d", history]);
  expect(await f.store.write(mutation)).toMatchObject({ status: "ok" });
});


it("names unavailable retained history and succeeds after restoring the original commit object", async () => {
  const f = await createRefFixture();
  const first = await seed(f, f.reference("work-item/meta"));
  const live = liveRef(first), history = live.replace("refs/arc/", "refs/arc/history/");
  const ancestor = (await f.ports.exec("git", ["rev-parse", live])).stdout.trim();
  const object = (await f.ports.rawExec(["cat-file", "commit", ancestor], { objectAccess: "local-only" })).stdout;
  success(await f.store.write(update(f, first)));
  const current = success(await f.store.read({ reference: first.reference }));
  await f.ports.exec("git", ["update-ref", history, ancestor]);
  await removeLooseObject(f.root, ancestor, f.gitDir);
  const mutation = { ...update(f, current, current.content), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
  expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: history,
    remedy: { text: expect.stringMatching(/restore|fetch/iu) } } });
  expect(success(await f.store.read({ reference: current.reference }))).toEqual(current);
  const restored = await f.ports.execInput(["hash-object", "-t", "commit", "-w", "--stdin"], new TextDecoder().decode(object));
  expect(restored.trim()).toBe(ancestor);
  expect(await f.store.write(mutation)).toMatchObject({ status: "ok" });
});
