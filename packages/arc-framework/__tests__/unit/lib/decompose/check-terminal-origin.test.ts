/** Terminal source admission follows current lifecycle state, independently of the saved kind. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeTerminalOrigin } from "../../../../src/lib/decompose/check-terminal-origin.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaState, writeMetaCurrentWorkflow, writeMetaDesign, writeMetaTaskList,
  writeMetaOrigin, writeMetaCompleted, writeMetaPrUrl } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreDeactivate } from "../../../../src/lib/work-unit/verbs/activate-deactivate-store.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { runReopen } from "../../../../src/lib/work-unit/verbs/reopen.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";

it("refuses a now-Active retirement and admits the origin after deactivation", async () => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(writeMetaState(primary.content, "Active"), "process-task-loop") }),
    provenance: { verb: "activate", lifecycleAction: "activate" } }));
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(acquired.result.map.machine.sourceKind).toBe("backlog-stub");
  expect(checkDecomposeTerminalOrigin(acquired.result)).toMatchObject({ status: "refused", reason: "origin-kind",
    remedy: { argv: ["arc", "deactivate", "origin"] } });
  expect(await runStoreDeactivate(h.ctx.executor, { name: "origin", baseBranch: "main" })).toMatchObject({ status: "deactivated" });
  const repaired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(checkDecomposeTerminalOrigin(repaired.result)).toMatchObject({ status: "ok", result: { sourceKind: "started-planning" } });
});

it("refuses a renamed origin with the revision action and admits its restored name", async () => {
  const h = await createDecomposeTerminalFixture();
  const rename = (sourceSlug: string, targetSlug: string) => runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" }, { sourceSlug, targetSlug });
  expect(await rename("origin", "current-source")).toMatchObject({ status: "renamed" });
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(checkDecomposeTerminalOrigin(acquired.result)).toMatchObject({ status: "refused", reason: "origin-changed",
    remedy: { argv: ["arc", "decompose", "current-source", "--revise"] } });
  expect(await rename("current-source", "origin")).toMatchObject({ status: "renamed" });
  const repaired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(checkDecomposeTerminalOrigin(repaired.result).status).toBe("ok");
});

it("offers discard for a now-archived origin", async () => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    content: writeMetaPrUrl(writeMetaCompleted(writeMetaCurrentWorkflow(writeMetaState(primary.content, "Shipped"), null),
      "2026-10-19"), "https://example.test/pull/1") }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(checkDecomposeTerminalOrigin(acquired.result)).toMatchObject({ status: "refused", reason: "origin-kind",
    remedy: { argv: ["arc", "decompose", "origin", "--discard"] } });
});

it("derives a stub started after scaffolding from its current records", async () => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(primary.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(acquired.result.map.machine.sourceKind).toBe("backlog-stub");
  expect(checkDecomposeTerminalOrigin(acquired.result)).toMatchObject({ status: "ok", result: { sourceKind: "started-planning" } });
});

it("repeats the scaffold-source floor and passes after a write-back repair", async () => {
  const h = await createDecomposeTerminalFixture();
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const raw = [...h.store.state.records.values()].find(record => sameReference(record.reference, primary.reference));
  if (raw === undefined) throw new Error("Expected origin primary.");
  // Represent legacy missing metadata that current write checks would refuse to create.
  raw.content = writeMetaOrigin(raw.content, "[none]");
  const invalid = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(checkDecomposeTerminalOrigin(acquired.result)).toMatchObject({ status: "refused", reason: "source-artifact", locus: "Origin" });
  await h.handEdit(invalid, writeMetaOrigin(invalid.content, "internal"));
  const repaired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(checkDecomposeTerminalOrigin(repaired.result).status).toBe("ok");
});

it("allows an Active extraction whose saved source kind was Planning", async () => {
  const h = await createDecomposeTerminalFixture({ started: true, extraction: true });
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, {
    content: writeMetaCurrentWorkflow(writeMetaState(primary.content, "Active"), "process-task-loop") }),
    provenance: { verb: "activate", lifecycleAction: "activate" } }));
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(acquired.result.map.machine.sourceKind).toBe("started-planning");
  expect(checkDecomposeTerminalOrigin(acquired.result)).toMatchObject({ status: "ok", result: { sourceKind: "active-origin" } });
});

it.each([false, true])("refuses Integrating before preview and names the shape's reopen path, extraction=%s", async extraction => {
  const h = await createDecomposeTerminalFixture({ started: true, extraction });
  await h.seed(recordReferences["work-item/spec"](h.primary.reference.owner), "# Origin spec\n\n## Scope\n\nAuthored design.\n");
  await h.seed(recordReferences["work-item/task-list"](h.primary.reference.owner), "# Task List: Origin\n\n## **Phase 1:** Work\n\n### `[x]` **1.1 Complete work**\n");
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const content = writeMetaTaskList(writeMetaDesign(writeMetaCurrentWorkflow(writeMetaState(primary.content, "Integrating"),
    "integrate-work-unit"), ["spec-origin.md"]), "tasks-origin.md");
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content }), provenance: { verb: "publish", lifecycleAction: "publish" } }));
  const acquired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const result = checkDecomposeTerminalOrigin(acquired.result);
  expect(result).toMatchObject({ status: "refused", reason: "origin-kind", remedy: { argv: ["arc", "reopen", "origin"] } });
  if (result.status !== "refused") throw new Error("Expected current-kind refusal.");
  expect(result.remedy.text.includes("arc deactivate origin")).toBe(!extraction);
  const executor = { ...h.ctx.executor, sideEffects: { "withdraw-pr": Object.assign(async () => undefined, {
    // This scenario has no live PR; its physical withdrawal is already complete.
    prepareWithdrawal: async () => ({ name: "withdraw-pr", run: async () => undefined, retryCommand: ["gh", "pr", "close", "feat/origin"] }),
  }) } };
  expect(await runReopen(executor, { name: "origin", prMerged: false })).toMatchObject({ status: "reopened" });
  if (!extraction) expect(await runStoreDeactivate(h.ctx.executor, { name: "origin", baseBranch: "main" })).toMatchObject({ status: "deactivated" });
  const repaired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(checkDecomposeTerminalOrigin(repaired.result)).toMatchObject({ status: "ok", result: { sourceKind: extraction ? "active-origin" : "started-planning" } });
});
