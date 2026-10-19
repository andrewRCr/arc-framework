/** Restating keeps operational history separate from the code baseline. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { deriveRestateCandidates } from "../../src/lib/handoff/restate-candidates.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaStateAtHandoff, writeMetaCommitAtHandoff, writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createStoreSyncPort } from "../../src/lib/store/operational-sync.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import type { StoreResult } from "../../src/lib/store/refusal.js";
import type { Store } from "../../src/lib/store/contract.js";

const exec: GitExec = async (_command, args) => ({ stdout: args[0] === "log"
  ? "abc123\nCode after handoff\nContext: Task 9.9\u0000" : ".arc/active/notes-unrelated.md\n", stderr: "", exitCode: 0 });
const tasks = (marker: string) => `# Tasks\n\n### \`[${marker}]\` **1.1 Implement**\n`;
async function fixture() {
  const h = createLifecycleHarness();
  let meta = await h.seedMeta("subject", { owner: "alice" });
  const task = await h.seed(recordReferences["work-item/task-list"](meta.reference.owner), tasks(" "));
  const notes = await h.seed(recordReferences["work-item/notes"](meta.reference.owner), "# Notes\n");
  const anchor = lifecycleSuccess(await h.store.version());
  const update = async (record: typeof meta, content: string) => {
    lifecycleSuccess(await h.store.write({ action: "put", reference: record.reference, expected: record.version,
      content, ...(record.reference.kind === "work-item/meta" ? { placement: { kind: "active" as const } } : {}), provenance: { verb: "test", lifecycleAction: "update" } }));
    return lifecycleSuccess(await h.store.read({ reference: record.reference }));
  };
  meta = await update(meta, writeMetaCommitAtHandoff(writeMetaStateAtHandoff(meta.content, anchor), "baseline"));
  await update(task, tasks("x"));
  await update(notes, "# Notes\n\nChanged through Store.\n");
  return { ...h, meta, anchor, update };
}
it("takes meta anchors and record changes while keeping code commits a Git walk", async () => {
  const h = await fixture();
  expect(await deriveRestateCandidates({ exec, sessionNotes: null, store: h.store, workUnit: h.meta.reference, identity: "alice" }))
    .toEqual({ commitsSinceHandoff: [{ hash: "abc123", subject: "Code after handoff" }],
      tasksClosedSinceHandoff: ["1.1"], noteFileChangesSinceHandoff: [".arc/active/notes-subject.md"] });
});
it("keeps state candidates when the code anchor is unreachable", async () => {
  const h = await fixture();
  const broken: GitExec = () => Promise.reject(new Error("history rewritten"));
  expect(await deriveRestateCandidates({ exec: broken, sessionNotes: null, store: h.store, workUnit: h.meta.reference, identity: "alice" }))
    .toEqual({ commitsSinceHandoff: [], tasksClosedSinceHandoff: ["1.1"],
      noteFileChangesSinceHandoff: [".arc/active/notes-subject.md"], baselineSignal: "baseline-unknown" });
});
it("uses the Owner when the anchor was written, despite later ownership changes", async () => {
  const h = await fixture();
  h.meta = await h.update(h.meta, writeMetaOwner(h.meta.content, SlugSchema.parse("bob")));
  const store = Object.create(h.store) as typeof h.store;
  store.changes = async (input) => {
    if (input.references === undefined) throw new Error("foreign anchor exposed personal history");
    return h.store.changes(input);
  };
  expect((await deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "bob" }))
    .tasksClosedSinceHandoff).toEqual(["1.1"]);
});
it("retains the selected state's candidates when a newer handoff enters history", async () => {
  const h = await fixture();
  const store = Object.create(h.store) as Store;
  store.history = async (input) => {
    const nextAnchor = lifecycleSuccess(await h.store.version());
    h.meta = await h.update(h.meta, writeMetaCommitAtHandoff(
      writeMetaStateAtHandoff(h.meta.content, nextAnchor), "new-baseline"));
    return h.store.history(input);
  };
  expect(await deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "alice" }))
    .toEqual({ commitsSinceHandoff: [{ hash: "abc123", subject: "Code after handoff" }],
      tasksClosedSinceHandoff: ["1.1"], noteFileChangesSinceHandoff: [".arc/active/notes-subject.md"] });
  const fresh = await deriveRestateCandidates({ exec, sessionNotes: null, store: h.store, workUnit: h.meta.reference, identity: "alice" });
  expect(fresh.tasksClosedSinceHandoff).toEqual([]);
  expect(fresh.noteFileChangesSinceHandoff).toEqual([]);
});
it("names unavailable selected meta history and succeeds after its restoration", async () => {
  const h = await fixture();
  const store = Object.create(h.store) as Store;
  let repaired = false;
  store.history = async (input) => {
    const result = await h.store.history(input);
    return result.status === "ok" && !repaired
      ? { status: "ok", result: result.result.filter((entry) => entry.version !== h.meta.version) }
      : result;
  };
  await expect(deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "alice" }))
    .rejects.toThrow(`The selected meta version ${h.meta.version} is unavailable in history. Restore the meta history, then retry handoff.`);
  repaired = true;
  expect((await deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "alice" }))
    .tasksClosedSinceHandoff).toEqual(["1.1"]);
});
it("has no state baseline before the first handoff", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("new-unit");
  expect(await deriveRestateCandidates({ exec, sessionNotes: "**Commit at Handoff:** `legacy`", store: h.store, workUnit: meta.reference, identity: "alice" }))
    .toEqual({ commitsSinceHandoff: [], tasksClosedSinceHandoff: [], noteFileChangesSinceHandoff: [], baselineSignal: "baseline-unknown" });
});
const missingHistory: StoreResult<never> = { status: "refused" as const, refusal: { code: "state-unresolvable" as const, class: "recoverable" as const,
  historyRefs: ["refs/arc/history/work/00000000-0000-4000-8000-000000000001"], condition: "The saved project history is missing.", remedy: { text: "Fetch the project history ref and retry." } } };
it("pulls only named missing history and retries the exact saved-state query", async () => {
  const h = await fixture();
  let fetched = false;
  const store: Store = Object.create(h.store) as Store;
  store.changes = (input) => fetched ? h.store.changes(input) : Promise.resolve(missingHistory);
  const sync = createStoreSyncPort({ pull: (refs) => {
    if (refs?.length !== 1 || refs[0] !== "refs/arc/history/work/00000000-0000-4000-8000-000000000001") throw new Error("An unrelated ref was requested");
    fetched = true;
    return Promise.resolve({ status: "pulled" });
  } });
  expect((await deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "alice", sync }))
    .tasksClosedSinceHandoff).toEqual(["1.1"]);
});
it("retains the history condition and the failed pull's repair", async () => {
  const h = await fixture();
  const store: Store = Object.create(h.store) as Store;
  store.changes = () => Promise.resolve(missingHistory);
  const sync = createStoreSyncPort({ pull: () => Promise.resolve({ status: "unreachable",
    condition: "Origin is offline.", remedy: { text: "Reconnect to origin and retry." } }) });
  await expect(deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "alice", sync }))
    .rejects.toThrow("The saved project history is missing. Origin is offline. Reconnect to origin and retry.");
});
it("stops after one pull when the requested history remains unavailable", async () => {
  const h = await fixture();
  const store: Store = Object.create(h.store) as Store;
  store.changes = () => Promise.resolve(missingHistory);
  let attempts = 0;
  const sync = createStoreSyncPort({ pull: () => {
    if (++attempts > 1) throw new Error("Repeated pull");
    return Promise.resolve({ status: "pulled" });
  } });
  await expect(deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "alice", sync }))
    .rejects.toThrow("The saved project history is missing. Fetch the project history ref and retry.");
});
it("retries once with the default unbound port, which pulls no history", async () => {
  const h = await fixture();
  const store: Store = Object.create(h.store) as Store;
  let refused = false;
  store.changes = (input) => {
    if (!refused) { refused = true; return Promise.resolve(missingHistory); }
    return h.store.changes(input);
  };
  expect((await deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: h.meta.reference, identity: "alice" }))
    .tasksClosedSinceHandoff).toEqual(["1.1"]);
});
