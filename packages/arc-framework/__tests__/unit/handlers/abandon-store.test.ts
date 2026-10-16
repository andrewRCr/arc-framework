/** Actual abandon handler uses operational state without remote expansion or invoking-checkout artifacts. */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { VerbBase } from "../../../src/handlers/lifecycle-shared.js";
import type { ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
const state = vi.hoisted(() => ({ base: undefined as VerbBase | undefined, executor: undefined as ExecuteTransitionContext | undefined,
  note: vi.fn(), error: vi.fn(), remote: vi.fn(() => { throw Error("remote expansion is forbidden"); }) }));
vi.mock("@clack/prompts", () => ({ intro: vi.fn(), outro: vi.fn(), note: state.note, log: { info: vi.fn(), warn: vi.fn(), error: state.error } }));
vi.mock("../../../src/commands/active.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/commands/active.js")>(), expandActiveInFlight: state.remote,
}));
vi.mock("../../../src/handlers/lifecycle-shared.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/handlers/lifecycle-shared.js")>(),
  resolveVerbBase: () => Promise.resolve(state.base), buildExecutor: () => Promise.resolve({ executor: state.executor, settings: { "branch.base": "main" } }),
}));
import { handleAbandon } from "../../../src/handlers/lifecycle.js";
beforeEach(() => { vi.resetAllMocks(); state.base = undefined; state.executor = undefined;
  state.remote.mockImplementation(() => { throw Error("remote expansion is forbidden"); }); process.exitCode = undefined; });
afterEach(() => { process.exitCode = undefined; });
async function fixture() {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  const exec = vi.fn(() => Promise.reject(Error("Git observation is forbidden for a branchless unheld stub")));
  const io = { ...createUserIOContext(), exec, readFile: vi.fn(() => Promise.reject(Error("No invoking-checkout lifecycle artifact"))) };
  state.base = { cwd: "/repo", identity: "test-user", io, store: h.store };
  state.executor = buildExecutorContext({ cwd: "/repo", io, store: h.store, identity: "test-user", teamMode: false, internalTemplateDir: "/templates",
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: () => Promise.resolve(null) } });
  return { ...h, meta, exec, io };
}
describe("operational abandon handler", () => {
  it("abandons a stub without remote expansion or local metadata and reports an Integrating dependent from the view", async () => {
    const h = await fixture(); await h.seedMeta("dependent", { state: "Integrating", currentWorkflow: "integrate-work-unit", dependsOn: [SlugSchema.parse("demo")] });
    await handleAbandon("demo", { yes: true });
    expect(state.error).not.toHaveBeenCalled(); expect(process.exitCode).toBeUndefined();
    expect(state.remote).not.toHaveBeenCalled(); expect(h.exec).not.toHaveBeenCalled(); expect(h.io.readFile).not.toHaveBeenCalled();
    expect(state.note.mock.calls.some((call) => String(call[0]).includes("Integrating work unit dependent depends on demo"))).toBe(true);
    expect(await h.store.read({ reference: h.meta.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  it("keeps confirmation in the handler before any terminal mutation", async () => {
    const h = await fixture(); await handleAbandon("demo", {});
    expect(state.error).toHaveBeenCalledWith(expect.stringContaining("without --yes")); expect((await h.store.read({ reference: h.meta.reference })).status).toBe("ok");
    expect(state.remote).not.toHaveBeenCalled(); expect(h.exec).not.toHaveBeenCalled();
  });
  it("reports an Integrating dependency that retains the origin's former-name alias", async () => {
    const h = await fixture();
    lifecycleSuccess(await h.store.write({ ...recordPut(h.meta), action: "put", reference: { ...h.meta.reference, owner: { ...h.meta.reference.owner, name: SlugSchema.parse("renamed") } },
      content: renderMetaFile("renamed", { state: "Planning", owner: "test-user", workClass: "Light", currentWorkflow: "draft-design" }), provenance: { verb: "rename", lifecycleAction: "rename" } }));
    await h.seedMeta("dependent", { state: "Integrating", currentWorkflow: "integrate-work-unit", dependsOn: [SlugSchema.parse("demo")] });
    await handleAbandon("demo", { yes: true });
    expect(state.error).not.toHaveBeenCalled();
    expect(state.note.mock.calls.some((call) => String(call[0]).includes("Integrating work unit dependent depends on renamed"))).toBe(true);
    expect(state.remote).not.toHaveBeenCalled(); expect(h.exec).not.toHaveBeenCalled();
  });

});
