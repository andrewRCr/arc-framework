/** Pull and push refuse input outside the contract's shape before any fetch or publication. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema, type PullInput, type PushInput } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("sync input in the %s layout", layout => {
  it("refuses a malformed history or carry before reaching any remote, then syncs once corrected", async () => {
    const h = await refSyncFixture(layout);
    const { reference } = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-item" } }),
      content: makeMetaFixture("ended-item"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const current = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: current.version, content: current.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    const owner = reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("No minted work item");
    const history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`);
    const remoteCalls: string[][] = [];
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      if (args.includes("fetch") || args.includes("push")) remoteCalls.push(args);
      return h.b.ports.exec(command, args, options);
    } });
    const refs = async (): Promise<string> => (await h.b.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const before = await refs();
    for (const entry of ["refs/arc/history/work/", `refs/arc/histories/work/${owner.uid}`, `${history}\nrefs/heads/*`]) {
      expect(await store.pull({ history: [entry] } as unknown as PullInput), entry).toMatchObject({ status: "refused", refusal: {
        code: "record-malformed", class: "recoverable", rule: "store.pull-input", condition: expect.stringContaining("history.0"),
        remedy: { text: expect.stringContaining("refs/arc/history/work/<uid>") } } });
    }
    for (const input of [{ carry: { ref: "" } }, { carry: { ref: "refs/heads/main", expect: "main" } }, { force: true }]) {
      expect(await store.push(input as unknown as PushInput), JSON.stringify(input)).toMatchObject({ status: "refused",
        refusal: { code: "record-malformed", class: "recoverable", rule: "store.push-input" } });
    }
    expect(remoteCalls).toEqual([]);
    expect(await refs()).toBe(before);
    success(await store.pull({ history: [history] }));
    expect((await h.b.git(["rev-parse", history])).stdout.trim()).toBe((await h.a.git(["rev-parse", history])).stdout.trim());
    expect(success(await store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  }, 60_000);
});
