/** Manifest reads retain order, cursor authority and bounded tool groups. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput, frameWithRow, selectedRow } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, derivedFrameFromActive, sessionInitFixture, userSessionInit } from "../../helpers/session-init-fixtures.js";
import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import { compileResumeReads, resolveAgendaTaskCursor, READ_GROUP_BUDGET_BYTES } from "../../../src/commands/agenda/reads.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import type { TaskListCursorFileResult } from "../../../src/lib/task-list/file-cursor.js";

const taskPath = ".arc/active/tasks-work.md";
const cursor = resolveTaskListCursor("# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Implement behavior**\n");
async function input(options: { cursor?: TaskListCursorFileResult | null; planning?: boolean; absent?: string[]; sizes?: Record<string, number>; contributor?: boolean; nullWorkflow?: boolean; loadNeeded?: boolean } = {}): Promise<AgendaCompileInput> {
  const active = activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", taskListPath: taskPath,
    sessionType: options.nullWorkflow ? null : options.planning ? "planning" : "execution", planningStage: options.planning ? "draft-design" : null });
  const frame = derivedFrameFromActive(active, "andrew", ".arc/backlog/planned/group/cohort-group.md", options.cursor === undefined ? cursor : options.cursor);
  const row = selectedRow(frame);
  const envelope = await sessionInitFixture({ derivedLocusState: async () => frameWithRow(row), user: async () => userSessionInit({ loadNeeded: options.loadNeeded ?? false }) }, { role: options.contributor ? "contributor" : "maintainer" });
  return createAgendaFixtureInput(envelope, { read: {
    exists: async path => !options.absent?.some(suffix => path.endsWith(suffix)),
    size: async path => options.sizes?.[path] ?? 1000,
    read: async () => "",
    git: async args => { if (args.join(" ") === "log --oneline -10") return "abc123 Latest work"; throw new Error("Unexpected Git read"); },
  } });
}

describe("agenda resume reads", () => {
  it("reads the projected manifest in order with the strategic cursor", async () => {
    const value = await input();
    const steps = await compileResumeReads(value);
    const reads = steps.filter(step => step.type === "read");
    expect(value.envelope.loadSet?.ok).toBe(true);
    if (!value.envelope.loadSet?.ok) throw new Error("Expected manifest");
    expect(reads.map(step => step.path)).toEqual(value.envelope.loadSet.value.entries.map(entry => entry.path));
    expect(reads.find(step => step.path === taskPath)).toMatchObject({ readMode: { kind: "partial-strategic" }, cursor: cursor.status === "found" ? cursor.cursor : "invalid fixture" });
  });

  it("bounds each group and isolates oversized reads without decreasing groups", async () => {
    const oversized = ".arc/reference/briefs/AGENT-BRIEF.PROJECT.md";
    const value = await input({ sizes: { [oversized]: READ_GROUP_BUDGET_BYTES + 1 } });
    value.read.size = async path => path === oversized ? READ_GROUP_BUDGET_BYTES + 1 : Math.floor(READ_GROUP_BUDGET_BYTES / 2);
    const reads = (await compileResumeReads(value)).filter(step => step.type === "read");
    expect(reads).not.toHaveLength(0);
    expect(reads.map(step => step.group)).toEqual([...reads.map(step => step.group)].sort((a, b) => a - b));
    const groups = new Map<number, typeof reads>();
    for (const step of reads) groups.set(step.group, [...(groups.get(step.group) ?? []), step]);
    for (const group of groups.values()) {
      const size = (await Promise.all(group.map(step => value.read.size(step.path)))).reduce((a, b) => a + b, 0);
      expect(size <= READ_GROUP_BUDGET_BYTES || (group.length === 1 && group[0]?.path === oversized)).toBe(true);
    }
  });

  it.each(["planning", "missing", "no-open-task"] as const)("skips a task-list read for %s", async state => {
    const value = await input(state === "planning" ? { planning: true } : { cursor: state === "missing" ? { status: "missing", path: taskPath } : { status: "no-open-task" } });
    expect(await compileResumeReads(value)).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: taskPath })]));
  });

  it("reports a malformed cursor without reading task context", async () => {
    const value = await input({ cursor: { status: "malformed", error: { line: 1, message: "Bad task marker" } } });
    const steps = await compileResumeReads(value);
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "note", surface: "task-cursor" })]));
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: taskPath })]));
  });

  it("reports a failed cursor probe at the cursor decision boundary", () => {
    expect(resolveAgendaTaskCursor({ ok: false, error: { kind: "runtime", message: "Cursor read failed" } }))
      .toMatchObject({ cursor: null, note: { type: "note", surface: "task-cursor", text: expect.stringContaining("Cursor read failed") } });
  });

  it("reports absent expected context but silently skips absent working memory", async () => {
    const value = await input({ absent: ["STRATEGY-INDEX.md", "WORKING-MEMORY.md"] });
    const steps = await compileResumeReads(value);
    expect(steps).toEqual(expect.arrayContaining([{ type: "note", surface: "missing-file", text: expect.stringContaining("STRATEGY-INDEX.md") }]));
    expect(steps.filter(step => step.type === "note" && step.surface === "missing-file")).toHaveLength(1);
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: expect.stringContaining("WORKING-MEMORY.md") })]));
  });

  it("adds the contributor brief for a contributor", async () => {
    const steps = await compileResumeReads(await input({ contributor: true }));
    expect(steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "read", path: ".arc/reference/briefs/AGENT-BRIEF.CONTRIBUTOR.md" })]));
  });

  it("reports a selected role without a workflow", async () => {
    expect(await compileResumeReads(await input({ nullWorkflow: true }))).toEqual(expect.arrayContaining([
      { type: "note", surface: "mismatch", text: expect.stringContaining("workflow") },
    ]));
  });

  it("leaves history out when a notes sync can restore the absent session notes", async () => {
    const steps = await compileResumeReads(await input({ absent: ["SESSION-NOTES.md"], loadNeeded: true }));
    expect(steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "notes-history" })]));
  });

  it("renders checkout history when absent session notes cannot be restored", async () => {
    const value = await input({ absent: ["SESSION-NOTES.md"] });
    expect(await compileResumeReads(value)).toEqual(expect.arrayContaining([{ type: "render", surface: "notes-history", text: expect.stringContaining("abc123 Latest work") }]));
  });
});
