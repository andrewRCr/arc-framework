/** Re-copy lifecycle rules reconcile unpublished ends against late source changes. */
import { expect, it } from "vitest";
import { switchFixture, provenance, capturePeerState, landPreparedOldPush } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { abandonRemoteWork } from "../helpers/store/remote-lifecycle.js";


it.each(["write", "archive", "abandon"] as const)("reconciles the mover's abandonment with a late source %s", async mode => {
  const h = await switchFixture();
  const created = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "retired-during-move" } }),
    content: makeMetaFixture("retired-during-move"), placement: { kind: "active" }, provenance }));
  const companion = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: created.reference.owner, key: "late.md" });
  success(await h.store.write({ action: "put", reference: companion, expected: null, content: "Before retirement.\n", provenance }));
  success(await h.store.push()); success(await h.b.store.pull());
  const before = await capturePeerState(h);
  let publishedLineage = "", ownLineage = "";
  if (mode === "write") success(await h.b.store.write({ action: "put", reference: RecordReferenceSchema.parse({ ...companion, key: "late-only.md" }), expected: null,
    content: "Late teammate write.\n", provenance }));

  const after = await capturePeerState(h), owner = created.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("No minted work item");
  const live = `refs/arc/work/${owner.uid}`, history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`);
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step !== "remote.switched") return;
    ownLineage = await abandonRemoteWork(h, h.store, created.reference, h.a, "mover-end");
    success(await h.store.push());
    if (mode !== "write") {
      await h.b.git(["fetch", "--refmap=", "--no-tags", "--", h.origin, "refs/arc/project/registry:refs/arc/project/registry"]);
      const beforeTerminal = await capturePeerState(h);
      if (mode === "archive") success(await h.b.store.write({ action: "put", reference: created.reference,
        expected: success(await h.b.store.read({ reference: created.reference })).version, content: makeMetaFixture("retired-during-move"),
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
      else publishedLineage = await abandonRemoteWork(h, h.b.store, created.reference, h.b, "teammate-end");
      await landPreparedOldPush(h, beforeTerminal, await capturePeerState(h));
    } else await landPreparedOldPush(h, before, after);
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  if (moved.status !== "ok") throw new Error("The re-copy refused");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", live, history])).stdout.trim()).toBe(history);
  success(await h.store.pull({ history: [history] }));
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
  if (mode === "write") {
    const paths = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "ls-tree", "-r", "--name-only", history])).stdout;
    expect(paths, JSON.stringify(moved.result)).toContain("late-only");
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Late teammate write.", history])).stdout).toContain("Late teammate write.");
    expect(success(await h.store.read({ reference: lineage })).content).toBe(ownLineage);
  } else {
    if (mode === "archive") {
      expect(success(await h.store.read({ reference: created.reference })).placement).toMatchObject({ kind: "completed", quarter: "2026-q4" });
      expect(await h.store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    } else {
      const record = success(await h.store.read({ reference: lineage }));
      expect(record.content).toBe(publishedLineage);
      expect(record.conflicts).toEqual([]);
      expect(record.content).not.toBe(ownLineage);
    }
    expect(moved.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/withdraw/iu) }));
  }
}, 45_000);
