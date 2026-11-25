/** Backlog tier moves execute through the same transition engine and checked store. */
import { expect, it } from "vitest";
import { runPromote, runDemote } from "../../../../src/lib/work-unit/verbs/promote-demote.js";
import { buildExecutorContext } from "../../../../src/lib/work-unit/executor-context.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { UserIOContext } from "../../../../src/commands/user/types.js";
import type { Store } from "../../../../src/lib/store/contract.js";
function context(store: Store) {
  const io = { exec: scriptGitExec([]).exec, readFile: async () => "", writeFile: async () => {}, mkdir: async () => {},
    readDir: async () => [], writeNote: async () => {}, readNote: async () => null } as UserIOContext;
  const executor = buildExecutorContext({ cwd: "/checkout", io, identity: "test-user", teamMode: false, internalTemplateDir: "/tpl", store });
  executor.indexFs = { readdir: async () => [], readFile: async () => "" };
  return { executor, fs: { readdir: async () => [], rmdir: async () => {} } };
}
it("promotes a provisional stub and its Class in one batch", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example", { state: "Planning", currentWorkflow: null, workClass: "TBD" }, { kind: "backlog", commitment: "provisional" });
  expect(await runPromote(context(store), { name: "example", class: "Novel" })).toMatchObject({ status: "moved" });
  const read = lifecycleSuccess(await store.read({ reference: record.reference }));
  expect(read).toMatchObject({ placement: { kind: "backlog", commitment: "planned" }, fields: { workClass: "Novel" } });
  const history = lifecycleSuccess(await store.history({ reference: record.reference }));
  expect(history).toHaveLength(2);
  expect(history[0]?.provenance).toMatchObject({ verb: "promote", batchId: expect.any(String) });
});
it("refuses a nonprovisional unit through its store position", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  expect(await runPromote(context(store), { name: "example" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("not a provisional stub") });
  expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(record);
});
it("demotes a planned stub while retaining its Class", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example", { state: "Planning", currentWorkflow: null, workClass: "Heavy" }, { kind: "backlog", commitment: "planned" });
  expect(await runDemote(context(store), { name: "example" })).toMatchObject({ status: "moved" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference })))
    .toMatchObject({ placement: { kind: "backlog", commitment: "provisional" }, fields: { workClass: "Heavy" } });
});
