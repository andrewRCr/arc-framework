import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, HistoryRefSchema, type RefStorePorts } from "../../src/lib/store/index.js";
import { switchFixture, createRemoteMover } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it.each([false, true])("recovers an accepted copy whose archived item reopened before confirmation: %s", async reopen => {
  const h = await switchFixture();
  const made = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "copy-reopen" } }),
    content: makeMetaFixture("copy-reopen"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  const before = success(await h.store.read({ reference: made.reference }));
  success(await h.store.write({ action: "put", reference: before.reference, expected: before.version, content: before.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.store.push());
  if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected a work UID");
  const live = `refs/arc/work/${made.reference.owner.uid}`, history = HistoryRefSchema.parse(`refs/arc/history/work/${made.reference.owner.uid}`);
  let published = false, interrupt = true;
  const ports: RefStorePorts = { ...h.ports,
    exec: async (command, args, options) => {
      const result = await h.ports.exec(command, args, options);
      if (args.includes("push") && args.includes(h.destinationDirectory)) published = true;
      return result;
    },
    execInput: async (args, input, options) => {
      if (published && interrupt && args.includes("update-ref")) { interrupt = false; throw new Error("Interrupted copy confirmation"); }
      return h.ports.execInput(args, input, options);
    } };
  await expect(invokeStoreMigrate(["--to", h.to], ports)).rejects.toThrow("Interrupted copy confirmation");
  const journal = "refs/arc/tmp/migrate/pending-copy/record";
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", journal])).stdout.trim()).toBe(journal);
  const held = JSON.parse((await h.a.exec("git", ["cat-file", "blob", journal])).stdout) as { attempt: { changes: { ref: string; next: string | null }[] } };
  const proposed = held.attempt.changes.find(change => change.ref === history)?.next;
  expect(proposed).toEqual(expect.any(String));
  if (reopen) {
    const peer = await createRemoteMover(h, h.destinationDirectory, "reopener");
    success(await peer.store.pull({ history: [history] }));
    const archived = success(await peer.store.read({ reference: made.reference }));
    success(await peer.store.write({ action: "put", reference: archived.reference, expected: archived.version, content: archived.content,
      placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    success(await peer.store.push());
    await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "merge-base", "--is-ancestor", proposed!, live]);
  }
  const result = await invokeStoreMigrate([], h.ports);
  expect(result.status, JSON.stringify(result)).toBe("ok");
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout).toBe("");
  success(await h.store.pull({ history: [history] }));
  expect(success(await h.store.read({ reference: made.reference })).placement?.kind).toBe(reopen ? "active" : "completed");
}, 90_000);
