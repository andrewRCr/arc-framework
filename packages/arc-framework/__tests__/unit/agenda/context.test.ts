/** Session notes determine effective context and handoff freshness at compile time. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, derivedFrameFromActive, sessionInitFixture } from "../../helpers/session-init-fixtures.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import { compileResumeContext, resolveAgendaSessionType } from "../../../src/commands/agenda/context.js";
import type { LoadSetSessionType } from "../../../src/lib/load-set/projection.js";

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
