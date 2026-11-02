/** Start entry resolves lifecycle targets before compiling readiness and launch. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { resolveBacklogStub } from "../../../src/lib/work-unit/backlog-stub.js";
import { activeSessionInit, derivedFrameFromActive, baseBranchSync, dirtyState, rosterResult, worktreeSync, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../helpers/status-context.js";

async function fixture(probes: SessionInitProbeOverrides = {}) {
  const h = createLifecycleHarness();
  const { input } = await createSignalAgendaFixture(undefined, probes);
  input.entry = await createTestStatusContext({ store: h.store, identity: "test-user", cwd: "/repo" });
  return { input, h };
}

async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("start readiness entry", () => {
  it.each(["provisional", "planned"] as const)("reads a %s target and offers its readiness method before launch", async commitment => {
    const { input, h } = await fixture();
    const record = await h.seedMeta("target", { state: "Planning", currentWorkflow: null, taskList: "tasks-target.md" },
      { kind: "backlog", commitment });
    const stub = await resolveBacklogStub("/repo", "target", h.store);
    if (stub === null) throw new Error("Expected a real stored backlog stub");
    input.read.read = async path => path === stub.metaPath ? record.content : "# Tasks\n";
    input.signals = { start: "target" };
    const agenda = await compile(input);
    expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "work-unit", key: "target" } });
    const taskListPath = join(stub.dir, "tasks-target.md");
    expect(agenda.steps.filter(step => step.type === "read")).toEqual(expect.arrayContaining([
      { type: "read", path: stub.metaPath, readMode: { kind: "full" }, group: expect.any(Number) },
      { type: "read", path: taskListPath, readMode: { kind: "full" }, group: expect.any(Number) },
    ]));
    expect(agenda.steps.at(-2)).toEqual({ type: "fragment", target: { kind: "method", name: "assess-start-readiness" },
      args: { slug: "target", metaPath: stub.metaPath, taskListPath } });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "launch", autoProceed: false });
  });
});


describe("Start readiness surfaces", () => {
  it("presents checkout drift, dirty state and workload without worktree synchronization", async () => {
    const { input, h } = await fixture({
      dirty: async () => dirtyState({ state: "dirty", fileCount: 3 }),
      worktree: async () => worktreeSync({ state: "remote-ahead", behind: 2 }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }),
      roster: async () => rosterResult({ entries: [{ worktreePath: "/wt/other", branch: "feat/other",
        metaFilePath: "/wt/other/.arc/active/meta-other.md", class: "Heavy" }] }),
    });
    await h.seedMeta("target", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    input.signals = { start: "target" };
    const agenda = await compile(input);
    const surfaces = agenda.steps.filter(step => step.type === "render" || step.type === "note");
    expect(surfaces.map(step => step.surface)).toEqual(expect.arrayContaining(["header", "worktree-behind", "stale-base", "dirty", "concurrent-workload"]));
    expect(surfaces.find(step => step.surface === "dirty")?.text).toContain("3 file(s)");
    expect(surfaces.find(step => step.surface === "concurrent-workload")?.text).toContain("1 Heavy");
    expect(surfaces.some(step => step.surface === "unconsumed-signal")).toBe(false);
    expect(agenda.steps.filter(step => step.type === "exec" || step.type === "offer")).toEqual([]);
  });

  it("reports the entering work unit's handoff gap without reading its artifacts", async () => {
    const active = activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution" });
    const { input, h } = await fixture({ active: async () => active,
      derivedLocusState: async () => derivedFrameFromActive(active, "test-user", null, null, null, true) });
    await h.seedMeta("target", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    input.signals = { start: "target" };
    const agenda = await compile(input);
    expect(agenda.steps).toContainEqual({ type: "note", surface: "freshness-gap", text: "There is no handoff baseline for this session." });
    expect(agenda.steps.filter(step => step.type === "read").some(step => /meta-work|tasks-work|process-task-loop/u.test(step.path))).toBe(false);
  });
});


it("falls back to the entering work unit after naming an unresolved Start target", async () => {
  const active = activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution" });
  const { input } = await fixture({ active: async () => active,
    derivedLocusState: async () => derivedFrameFromActive(active, "test-user", null, null, null, true) });
  const ordinary = await compile(input);
  input.signals = { start: "missing" };
  const agenda = await compile(input);
  expect(agenda.signals).toEqual({ start: "missing" });
  expect(agenda.orientation).toEqual(ordinary.orientation);
  expect(agenda.steps[0]).toEqual({ type: "note", surface: "start-target", text: "Target 'missing' is nonexistent." });
  expect(agenda.steps.slice(1)).toEqual(ordinary.steps);
  expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
});
