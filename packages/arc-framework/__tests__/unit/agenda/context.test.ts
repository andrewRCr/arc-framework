/** Session notes determine effective context and handoff freshness at compile time. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, derivedFrameFromActive, sessionInitFixture } from "../../helpers/session-init-fixtures.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import { compileResumeContext, resolveAgendaSessionType } from "../../../src/commands/agenda/context.js";
import type { LoadSetSessionType } from "../../../src/lib/load-set/projection.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { seed, success } from "../../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../../src/lib/store/kinds/entry-configs.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaNextAction, writeMetaSessionContext, writeMetaSessionType, writeMetaStateAtHandoff } from "../../../src/lib/store/kinds/meta/writers.js";
import type { AgendaStep } from "../../../src/commands/agenda/schema.js";
import type { Store } from "../../../src/lib/store/contract.js";

const metaPath = ".arc/active/meta-work.md";
const notesPath = ".arc/user/andrew/work/SESSION-NOTES.md";
const taskPath = ".arc/active/tasks-work.md";
const head = "a".repeat(40);
const earlier = "b".repeat(40);
async function fixture(options: { planning?: boolean; notes?: string; unresolved?: boolean; resolved?: string; metaChanged?: boolean; closed?: boolean; workingMemoryPath?: string } = {}) {
  const files = new Map([[metaPath, makeMetaFixture("work", { currentWorkflow: "create-spec" })],
    [notesPath, options.notes ?? "**Commit at Handoff:** `aaaaaaa`\n"]]);
  const active = activeSessionInit({ resolution: "single", path: metaPath, taskListPath: taskPath,
    sessionType: options.planning ? "planning" : "execution", planningStage: options.planning ? "draft-design" : null });
  const cursor = options.closed ? { status: "no-open-task" as const }
    : resolveTaskListCursor("# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Implement behavior**\n");
  const envelope = await sessionInitFixture({ derivedLocusState: async () => derivedFrameFromActive(active, "andrew", null,
    cursor, options.workingMemoryPath) });
  const input = createAgendaFixtureInput(envelope, { read: {
    exists: async () => true, size: async () => 1000,
    read: async path => files.get(path) ?? "",
    git: async args => {
      if (args[0] === "rev-parse") { if (options.unresolved) throw new Error("Unknown revision"); return `${options.resolved ?? head}\n`; }
      if (args[0] === "log" && args.includes("--oneline")) return "c123456 Context changed\nd123456 More work\n";
      if (args[0] === "log" && args.includes("--name-only")) return options.metaChanged ? `${metaPath}\n` : "";
      throw new Error(`Unexpected Git read: ${args.join(" ")}`);
    },
  } });
  return { input, files };
}

describe("agenda session-notes fields", () => {
  it("recomposes an execution resume as planning from comment-free inline-code fields", async () => {
    const { input } = await fixture({ notes: "<!-- **Session Type:** execution -->\n**Session Type:** `PlAnNiNg`\n\n**Commit at Handoff:** `aaaaaaa`\n" });
    const result = await compileResumeContext(input);
    expect(result.steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/system/workflows/arc/create-spec.md" })]));
    expect(result.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: taskPath })]));
    expect(result.metaContent).toContain("Current Workflow");
  });

  it("recomposes planning as execution with its task cursor", async () => {
    const { input } = await fixture({ planning: true, notes: "**Session Type:** `EXECUTION`\n\n**Commit at Handoff:** aaaaaaa\n" });
    const result = await compileResumeContext(input);
    expect(result.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "read", path: taskPath, cursor: expect.objectContaining({ section: expect.objectContaining({ id: "1.1" }) }) }),
      expect.objectContaining({ type: "read", path: ".arc/system/workflows/arc/process-task-loop.md" }),
    ]));
  });

  it("preserves the identity-global working-memory path when recomposing", async () => {
    const path = "/primary/personal/andrew/WORKING-MEMORY.md";
    const { input } = await fixture({ notes: "**Session Type:** planning\n\n**Commit at Handoff:** aaaaaaa\n", workingMemoryPath: path });
    const steps = (await compileResumeContext(input)).steps;
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path })]));
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/user/andrew/WORKING-MEMORY.md" })]));
  });

  it("re-derives execution closeout when the task list has no open task", async () => {
    const { input } = await fixture({ planning: true, closed: true, notes: "**Session Type:** execution\n\n**Commit at Handoff:** aaaaaaa\n" });
    const steps = (await compileResumeContext(input)).steps;
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md" })]));
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/system/workflows/arc/process-task-loop.md" })]));
  });

  it.each([
    ["execution", "prepublication"], ["execution", "integration"], ["prepublication", "planning"],
    ["integration", "execution"], ["planning", "invalid"],
  ] as [LoadSetSessionType, string][])("ignores and warns on override %s to %s", (current, authored) => {
    expect(resolveAgendaSessionType(current, authored)).toMatchObject({ sessionType: current,
      warning: { type: "note", surface: "session-type-override", text: expect.stringContaining(authored) } });
  });

  it("emits no freshness gap for an abbreviation that resolves to HEAD", async () => {
    const { input } = await fixture();
    expect((await compileResumeContext(input)).steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "freshness-gap" })]));
  });

  it.each([false, true])("reports commits since handoff and meta-changed=%s", async metaChanged => {
    const { input } = await fixture({ resolved: earlier, metaChanged });
    const notes = (await compileResumeContext(input)).steps.filter(step => step.type === "note" && step.surface === "freshness-gap");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ text: expect.stringContaining("c123456 Context changed") });
    expect(notes[0]).toMatchObject({ text: expect.stringContaining(`Meta changed: ${metaChanged ? "yes" : "no"}`) });
  });

  it("treats comment-only hashes and none sentinels as no handoff baseline", async () => {
    const { input } = await fixture({ notes: "<!-- **Commit at Handoff:** aaaaaaa -->\n**Commit at Handoff:** `[none]`\n**Session Type:** [none]\n" });
    expect((await compileResumeContext(input)).steps).toEqual(expect.arrayContaining([
      { type: "note", surface: "freshness-gap", text: expect.stringContaining("no handoff baseline") },
    ]));
  });

  it("reports an unreachable baseline without failing compilation", async () => {
    const { input } = await fixture({ unresolved: true });
    expect((await compileResumeContext(input)).steps).toEqual(expect.arrayContaining([
      { type: "note", surface: "freshness-gap", text: expect.stringContaining("unreachable") },
    ]));
  });

  it("reads fresh session fields again on the next compile", async () => {
    const { input, files } = await fixture({ notes: "**Session Type:** planning\n\n**Commit at Handoff:** aaaaaaa\n" });
    expect((await compileResumeContext(input)).steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/system/workflows/arc/create-spec.md" })]));
    files.set(notesPath, "**Session Type:** execution\n\n**Commit at Handoff:** aaaaaaa\n");
    expect((await compileResumeContext(input)).steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: taskPath })]));
  });
});

const workUnit = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "work" }));
const cohortRecord = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" }));
const freshnessGaps = (steps: readonly AgendaStep[]) => steps.filter(step => step.type === "note" && step.surface === "freshness-gap");

/** A work unit handed off through the store, whose meta the projection reads back at the meta's path. */
async function storeFixture(options: { sessionType?: "planning" | "execution"; sessionContext?: string | null } = {}) {
  const f = createReferenceFixture(ENTRY_CONFIGS, createKindRegistry(PRODUCTION_REGISTRATIONS));
  const seeded = await seed(f, workUnit, makeMetaFixture("work"));
  const baseline = success(await f.store.version());
  let content = writeMetaStateAtHandoff(seeded.content, baseline);
  content = writeMetaSessionType(content, options.sessionType ?? null);
  content = writeMetaSessionContext(content, options.sessionContext === undefined ? "Resume at the parser." : options.sessionContext);
  success(await f.store.write({ ...recordPut(seeded, { content }), provenance: { verb: "handoff-write", lifecycleAction: "handoff" } }));
  const active = activeSessionInit({ resolution: "single", path: metaPath, taskListPath: taskPath, sessionType: "execution", planningStage: null });
  const cursor = resolveTaskListCursor("# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Implement behavior**\n");
  const envelope = await sessionInitFixture({ derivedLocusState: async () => derivedFrameFromActive(active, "andrew", null, cursor, null, true) });
  const base = createAgendaFixtureInput(envelope, { read: {
    exists: async path => path !== notesPath, size: async () => 1000,
    read: async path => path === metaPath ? success(await f.store.read({ reference: workUnit })).content : "",
    git: async args => {
      if (args[0] === "log" && args.includes("--oneline")) return "c123456 Context changed\n";
      throw new Error(`Unexpected Git read: ${args.join(" ")}`);
    },
  } });
  const input = { ...base, entry: { ...base.entry, store: f.store } };
  return { f, input, baseline };
}

describe("agenda handoff fields off the branch", () => {
  it("reads SESSION-NOTES on the in-repo implementation, touching no store operation", async () => {
    const { input } = await fixture({ notes: "**Session Type:** planning\n\n**Commit at Handoff:** aaaaaaa\n", resolved: earlier });
    const inRepo = { ...input, entry: { ...input.entry, store: { capabilities: { stateOffBranch: false } } as Store } };
    const steps = (await compileResumeContext(inRepo)).steps;
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/system/workflows/arc/create-spec.md" })]));
    expect(freshnessGaps(steps)).toEqual([expect.objectContaining({ text: expect.stringContaining("Commits since handoff aaaaaaa") })]);
  });

  it("reports no gap when nothing landed after the handoff's own write", async () => {
    const { input } = await storeFixture();
    expect(freshnessGaps((await compileResumeContext(input)).steps)).toEqual([]);
  });

  it("reports no gap when the meta's State at Handoff is the current version", async () => {
    const { f, input } = await storeFixture();
    const current = success(await f.store.read({ reference: workUnit }));
    const read = input.read.read;
    const pinned = { ...input, read: { ...input.read, read: async (path: string) => path === metaPath
      ? writeMetaStateAtHandoff(current.content, success(await f.store.version())) : read(path) } };
    expect(freshnessGaps((await compileResumeContext(pinned)).steps)).toEqual([]);
  });

  it("takes the meta's Session Type as the session-type override", async () => {
    const { input } = await storeFixture({ sessionType: "planning" });
    const steps = (await compileResumeContext(input)).steps;
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: taskPath })]));
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/system/workflows/arc/process-task-loop.md" })]));
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "session-type-override" })]));
  });

  it.each([true, false])("renders the checkout's history after the meta when it records no session context=%s", async empty => {
    const { input } = await storeFixture({ sessionContext: empty ? null : "Resume at the parser." });
    const steps = (await compileResumeContext(input)).steps;
    const history = steps.findIndex(step => step.type === "render" && step.surface === "notes-history");
    if (!empty) { expect(history).toBe(-1); return; }
    expect(steps[history]).toMatchObject({ text: expect.stringContaining("c123456 Context changed") });
    expect(steps[history - 1]).toMatchObject({ type: "read", path: metaPath });
  });

  it.each([false, true])("reports each change since the handoff, and meta-changed=%s", async metaChanged => {
    const { f, input, baseline } = await storeFixture();
    await seed(f, cohortRecord, "# Cohort: `group`\n\n**Parent:** [none]\n\n**Purpose:** Group work.\n");
    if (metaChanged) {
      const current = success(await f.store.read({ reference: workUnit }));
      success(await f.store.write({ ...recordPut(current, { content: writeMetaNextAction(current.content, "Continue the parser.") }),
        provenance: { verb: "save", lifecycleAction: "edit" } }));
    }
    const gaps = freshnessGaps((await compileResumeContext(input)).steps);
    expect(gaps).toEqual([{ type: "note", surface: "freshness-gap", text: expect.stringContaining(`State changes since handoff ${baseline}:`) }]);
    expect(gaps[0]).toMatchObject({ text: expect.stringContaining("cohort/document group") });
    expect(gaps[0]).toMatchObject({ text: expect.stringContaining(`Meta changed: ${metaChanged ? "yes" : "no"}.`) });
    expect(gaps[0]).not.toMatchObject({ text: expect.stringContaining("handoff-write") });
  });
});
