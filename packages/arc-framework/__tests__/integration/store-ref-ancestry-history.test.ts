import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefClock } from "../helpers/store/ref-clock.js";

const provenance = { verb: "archive", lifecycleAction: "archive" };

describe.each(["default", "separate"] as const)("rewritten retained history in the %s layout", (layout) => {
  it.each([false, true])("reports a supplemental rewrite without claiming absence, with a later timeout = %s", async (expire) => {
    const h = await refSyncFixture(layout), quarter = ArchiveQuarterSchema.parse("2026-q4");
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("retained"),
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "retained" }, kind: "work-item/meta" }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    let current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version, content: current.content,
      placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    if (!("uid" in made.reference.owner)) throw new Error("Expected a minted work item");
    const history = `refs/arc/history/work/${made.reference.owner.uid}`;
    const first = (await h.remote("git", ["rev-parse", history])).stdout.trim();
    current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version,
      content: `${current.content}\nSecond revision.\n`, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull({ history: [HistoryRefSchema.parse(history)] }));
    const second = (await h.remote("git", ["rev-parse", history])).stdout.trim();
    const held = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: made.reference, expected: held.version,
      content: `${held.content}\nLocal completed edit.\n`, placement: { kind: "completed", quarter }, provenance }));
    const local = (await h.b.git(["rev-parse", history])).stdout.trim();
    current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version,
      content: `${current.content}\nThird revision.\n`, placement: { kind: "completed", quarter }, provenance }));
    const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent update.\n";
    success(await h.a.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
    await h.a.git(["push", h.remoteName, `refs/arc/archive/${quarter}:refs/arc/archive/${quarter}`, "refs/arc/project/inbox:refs/arc/project/inbox"]);
    await h.remote("git", ["update-ref", history, first, second]);
    if (expire) {
      const clock = createRefClock(new Date(0), 0);
      let expired = false;
      const observer = createRefStore({ ...h.b.ports, ...clock, execInput: async (args, input, options) => {
        const result = await h.b.ports.execInput(args, input, options);
        if (!expired && input.includes(`delete refs/arc/tmp/seen/${h.remoteName}/${history.slice("refs/arc/".length)} `)) {
          expired = true; clock.advance(120001);
        }
        return result;
      } });
      const result = success(await observer.pull());
      expect(expired).toBe(true);
      expect(result.pulls[0]).toMatchObject({ status: "failed", failure: { code: "unreachable", cause: "timeout" },
        notices: [expect.objectContaining({ kind: "history-diverged", ref: history, local: second, remote: first })] });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices))
        .toEqual([expect.objectContaining({ kind: "history-diverged", ref: history, local: second, remote: first })]);
      expect((await h.b.git(["rev-parse", history])).stdout.trim()).toBe(local);
      expect((await h.b.git(["rev-parse", history.replace("refs/arc/", `refs/arc-remotes/${h.remoteName}/`)])).stdout.trim()).toBe(second);
      expect(success(await h.b.store.read({ reference: inbox })).content).toBe(content);
    }
  });
});
