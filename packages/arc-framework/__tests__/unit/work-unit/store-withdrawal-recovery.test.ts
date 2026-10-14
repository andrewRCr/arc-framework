/** Store transitions admit withdrawal before writing and retry only failed physical work. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { executeTransition, type SideEffectHandler } from "../../../src/lib/work-unit/lifecycle-executor.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeMetaNextAction } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import type { RecoverablePrWithdrawalHandler, PrWithdrawMode } from "../../../src/lib/work-unit/side-effects/withdraw-pr.js";
import type { UserIOContext } from "../../../src/commands/user/types.js";

async function fixture(mode: PrWithdrawMode = "close") {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-demo.md" }, { kind: "active" }, {
    branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }],
  });
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner), "# Task List: demo\n\n### `[x]` **1.1 Done**\n");
  let unavailable = true;
  const writeArgs = mode === "close" ? ["pr", "close", "feat/demo"] : ["pr", "ready", "feat/demo", "--undo"];
  const git = scriptGitExec([
    { match: ["symbolic-ref", "--quiet", "--short", "HEAD"], responses: [{ stdout: "feat/demo" }] },
    { command: "gh", match: ["pr", "view", "feat/demo", "--json", "state,isDraft"], responses: [{ stdout: JSON.stringify({ state: "OPEN", isDraft: false }) }] },
    { command: "gh", match: writeArgs, responses: [() => unavailable ? { failure: { exitCode: 1, stderr: "network unavailable" } } : { stdout: "withdrawn" }] },
  ]);
  const forbidden = async (): Promise<never> => { throw new Error("Tracked artifacts must not be used"); };
  const io: UserIOContext = { exec: git.exec, readFile: forbidden, writeFile: forbidden, mkdir: forbidden,
    readDir: forbidden, writeNote: forbidden, readNote: forbidden };
  const ctx = buildExecutorContext({ cwd: "/absent", io, store: h.store, projectId: async () => "repo",
    identity: "test-user", teamMode: false, internalTemplateDir: "/absent" });
  const run = () => executeTransition(ctx, { verb: "reopen", slug: "demo", inputs: { prMerged: false, prWithdrawMode: mode } });
  return { ...h, ctx, meta, git, run, writeArgs, repair: () => { unavailable = false; },
    readMeta: async () => lifecycleSuccess(await h.store.read({ reference: meta.reference })) };
}
it("refuses an unwired declared withdrawal before any atomic write", async () => {
  const h = await fixture(); delete h.ctx.sideEffects?.["withdraw-pr"];
  expect(await h.run()).toMatchObject({ status: "rejected", stage: "inputs", message: expect.stringContaining("withdraw-pr") });
  expect(await h.readMeta()).toEqual(h.meta);
  expect(h.git.calls).toEqual([]);
});
it("refuses a withdrawal without its captured physical preparation before writing", async () => {
  const h = await fixture();
  h.ctx.sideEffects = { "withdraw-pr": (() => undefined) satisfies SideEffectHandler };
  expect(await h.run()).toMatchObject({ status: "rejected", stage: "inputs", message: expect.stringContaining("withdraw-pr") });
  expect(await h.readMeta()).toEqual(h.meta);
});
it.each(["close", "draft"] as const)("retains the persisted state and exact %s physical retry from the production binding", async (mode) => {
  const h = await fixture(mode);
  const result = await h.run();
  expect(result).toMatchObject({ status: "ok", sideEffectsFired: [], continuation: {
    kind: "git-step", step: "withdraw-pr", argv: ["gh", ...h.writeArgs], reason: expect.stringContaining("network unavailable"),
  } });
  const persisted = await h.readMeta();
  expect(persisted.fields).toMatchObject({ state: "Active", currentWorkflow: "prepare-work-unit" });
  expect(lifecycleSuccess(await h.store.history({ reference: persisted.reference }))).toHaveLength(2);
  if (result.status !== "ok" || result.continuation === undefined) throw new Error("Missing physical continuation");
  expect(result.continuation.argv).not.toContain("reopen");
  h.repair();
  await h.ctx.exec?.(result.continuation.argv[0]!, [...result.continuation.argv.slice(1)]);
  expect(await h.readMeta()).toEqual(persisted);
  expect(lifecycleSuccess(await h.store.history({ reference: persisted.reference }))).toHaveLength(2);
  expect(h.git.calls.filter((call) => call.command === "gh" && call.args[1] === (mode === "close" ? "close" : "ready"))).toHaveLength(2);
});
it("fails branch preparation before persisting the reopen transition", async () => {
  const h = await fixture();
  h.ctx.projectId = async () => { throw new Error("repository identity unavailable"); };
  // Rebind the production callback to the failing invocation boundary.
  const next = buildExecutorContext({ cwd: h.ctx.cwd, io: { exec: h.ctx.exec!, readFile: async () => "", writeFile: async () => {},
    mkdir: async () => {}, readDir: async () => [], writeNote: async () => {}, readNote: async () => null }, store: h.store,
    projectId: h.ctx.projectId, identity: "test-user", teamMode: false, internalTemplateDir: "/absent" });
  expect(await executeTransition(next, { verb: "reopen", slug: "demo", inputs: { prMerged: false } })).toMatchObject({
    status: "rejected", stage: "inputs", message: expect.stringContaining("repository identity unavailable"),
  });
  expect(await h.readMeta()).toEqual(h.meta);
  expect(h.git.calls).toEqual([]);
});
it("counts a successful declared withdrawal only after its physical callback succeeds", async () => {
  const h = await fixture(); h.repair();
  expect(await h.run()).toMatchObject({ status: "ok", sideEffectsFired: ["withdraw-pr"] });
  expect((await h.readMeta()).fields).toMatchObject({ state: "Active" });
  expect(h.git.calls.filter((call) => call.command === "gh" && call.args[1] === "close")).toHaveLength(1);
});

it("does not withdraw when checked persistence refuses a stale prepared record", async () => {
  const h = await fixture();
  const handler = h.ctx.sideEffects?.["withdraw-pr"] as RecoverablePrWithdrawalHandler;
  const prepare = handler.prepareWithdrawal;
  handler.prepareWithdrawal = async (context) => {
    const step = await prepare(context);
    lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, { content: writeMetaNextAction(h.meta.content, "Concurrent note") }),
      provenance: { verb: "fixture", lifecycleAction: "edit" } }));
    return step;
  };
  expect(await executeTransition(h.ctx, { verb: "reopen", slug: "demo", inputs: { prMerged: false,
    storeTransition: { primary: h.meta } } })).toMatchObject({ status: "rejected", stage: "store", refusal: { code: "version-conflict" } });
  expect((await h.readMeta()).fields).toMatchObject({ state: "Integrating", nextAction: "Concurrent note" });
  expect(h.git.calls.filter((call) => call.command === "gh")).toEqual([]);
});
