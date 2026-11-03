/** Start entry resolves lifecycle targets before compiling readiness and launch. */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { createAgendaReadPort } from "../../../src/commands/agenda/compile-input.js";
import { resolveBacklogStub } from "../../../src/lib/work-unit/backlog-stub.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { activeSessionInit, derivedFrameFromActive, baseBranchSync, dirtyState, rosterResult, worktreeSync, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../helpers/status-context.js";

async function fixture(probes: SessionInitProbeOverrides = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-agenda-start-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  const { input } = await createSignalAgendaFixture(undefined, probes);
  input.entry = await createTestStatusContext({ store: h.store, identity: "test-user", cwd });
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
  it.each((["provisional", "planned"] as const).flatMap(commitment => [false, true].map(stale => ({ commitment, stale }))))(
    "carries $commitment target records with stale checkout projections=$stale", async ({ commitment, stale }) => {
    const { input, h } = await fixture();
    const placement = { kind: "backlog", commitment } as const;
    const record = await h.seedMeta("target", {
      state: "Planning", currentWorkflow: null, taskList: "tasks-target.md",
    }, placement);
    const tasks = await h.seed(recordReferences["work-item/task-list"](record.reference.owner),
      "# Tasks\n\n## **Phase 1:** Build\n\n### `[ ]` **1.1 Build**\n");
    expect(record.reference.owner).toHaveProperty("uid");
    expect(tasks.reference.owner).toEqual(record.reference.owner);
    const stub = await resolveBacklogStub(input.entry.cwd, "target", h.store);
    if (stub === null) throw new Error("Expected a real stored backlog stub");
    input.read = createAgendaReadPort(input.entry.cwd, input.entry.io.exec);
    input.signals = { start: "target" };
    const taskListPath = join(stub.dir, "tasks-target.md");
    if (stale) {
      await mkdir(dirname(stub.metaPath), { recursive: true });
      await writeFile(stub.metaPath, "Contradictory checkout metadata\n");
      await writeFile(taskListPath, "Contradictory checkout tasks\n");
    }
      const agenda = await compile(input);
      expect(agenda.orientation).toEqual({ shape: "subject", subject: { kind: "work-unit", key: "target" } });
      expect(agenda.steps.filter(step => step.type === "read").some(step => [stub.metaPath, taskListPath].includes(step.path))).toBe(false);
      expect(agenda.steps.at(-2)).toEqual({ type: "fragment", target: { kind: "method", name: "assess-start-readiness" }, args: {
        slug: "target", metaPath: stub.metaPath, taskListPath, evidenceBackend: "store",
        metaReference: JSON.stringify(record.reference), metaVersion: record.version, metaContent: record.content,
        taskListStatus: "present", taskListReference: JSON.stringify(tasks.reference), taskListVersion: tasks.version, taskListContent: tasks.content,
      } });
      expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "launch", autoProceed: false });
  });

  it("carries explicit task-record absence without borrowing a declared checkout file", async () => {
    const { input, h } = await fixture();
    const record = await h.seedMeta("target", { state: "Planning", currentWorkflow: null, taskList: "tasks-target.md" },
      { kind: "backlog", commitment: "planned" });
    input.signals = { start: "target" };
    const agenda = await compile(input);
    expect(agenda.steps.at(-2)).toMatchObject({ type: "fragment", args: {
      evidenceBackend: "store", metaContent: record.content, taskListStatus: "absent",
      taskListReference: JSON.stringify(recordReferences["work-item/task-list"](record.reference.owner)),
      taskListContent: null, taskListVersion: null,
    } });
    expect(agenda.steps.filter(step => step.type === "read").some(step => /(?:meta|tasks)-target\.md$/u.test(step.path))).toBe(false);
  });

  it.each(["refused", "conflicted"] as const)("does not offer Start readiness with %s task evidence", async condition => {
    const { input, h } = await fixture();
    const record = await h.seedMeta("target", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
    const tasks = await h.seed(recordReferences["work-item/task-list"](record.reference.owner), "# Tasks\n");
    const read = h.store.read.bind(h.store);
    h.store.read = async request => request.reference.kind !== "work-item/task-list" ? read(request)
      : condition === "refused" ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
        reference: tasks.reference, rule: "task-evidence-unreadable", condition: "Task evidence is unreadable.",
        remedy: { text: "Repair the task record, then retry." } } }
        : { status: "ok", result: { ...tasks, conflicts: [recordReferences["work-item/conflict-record"](record.reference.owner, "task-conflict")] } };
    input.signals = { start: "target" };
    const agenda = await compile(input);
    expect(agenda.steps[0]).toMatchObject({ type: "note", surface: "start-target",
      text: expect.stringContaining(condition === "refused" ? "Repair the task record" : "conflict") });
    expect(agenda.steps.some(step => step.type === "fragment" && step.target.kind === "method" && step.target.name === "assess-start-readiness")).toBe(false);
    expect(agenda.steps.some(step => step.type === "gate" && step.kind === "launch")).toBe(false);
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
