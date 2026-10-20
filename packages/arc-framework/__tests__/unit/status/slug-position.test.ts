import { describe, expect, it, vi } from "vitest";

import {
  projectDerivedSlugPosition,
  projectScopeWindow,
  readDerivedSlugPosition,
  selectWorkUnitRow,
  type ResolvedCheckoutRow,
} from "../../../src/lib/status/slug-position.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { LifecycleState } from "../../../src/lib/work-unit/lifecycle-resolver.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";

type Context = ResolvedCheckoutRow["context"];

function context(overrides: Partial<Context> = {}): Context {
  return {
    kind: "resolved",
    metaPath: ".arc/active/meta-example.md",
    owner: "andrew",
    branch: "feat/example",
    sessionType: "execution",
    workflow: "process-task-loop",
    stage: null,
    taskListPath: ".arc/active/tasks-example.md",
    taskCursor: null,
    workUnitStage: "task-work",
    cohortDocPath: null,
    loadSet: { manifestVersion: 1, entries: [] },
    integrationBoundary: null,
    ...overrides,
  };
}

function cursorAt(id: string, title: string): Context["taskCursor"] {
  const item = { id, title, lineHint: 10 };
  return { status: "found", cursor: { section: item, leaf: item } };
}

function row(name: string, ctx: Context | null, kind: "work-unit" | "transient" = "work-unit"): DerivedCheckoutRow {
  return {
    checkout: { path: `/repo.${name}`, head: "a".repeat(40), branch: `feat/${name}`, detached: false, primary: false, folderPresent: true },
    markerGeneration: `sha256:${"b".repeat(64)}`,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: ctx,
    lifecycleLocation: "active",
    diagnostics: [],
    kind,
    subject: kind === "work-unit"
      ? { kind: "work-unit", key: name }
      : { kind: "errand", key: name, claimId: "c".repeat(32) },
  };
}

function resolved(ctx: Context): ResolvedCheckoutRow {
  const selected = selectWorkUnitRow([row("example", ctx)], "example");
  if (selected === null) throw new Error("fixture row did not resolve");
  return selected;
}

describe("selectWorkUnitRow", () => {
  it("selects the one work-unit checkout whose subject meta resolved", () => {
    const roster = [row("other", context()), row("example", context())];
    expect(selectWorkUnitRow(roster, "example")?.checkout.path).toBe("/repo.example");
  });

  it.each([
    ["no checkout holds it", [row("other", context())]],
    ["its context did not resolve", [row("example", null)]],
    ["only an Errand carries the key", [row("example", context(), "transient")]],
    ["two checkouts claim it", [row("example", context()), row("example", context())]],
  ])("returns null when %s", (_case, roster) => {
    expect(selectWorkUnitRow(roster, "example")).toBeNull();
  });
});

describe("readDerivedSlugPosition", () => {
  it("reads the roster as the given identity and projects the work unit's row", async () => {
    const readRoster = vi.fn(async () => [row("example", context({ taskCursor: cursorAt("8.1", "Complete verification") }))]);
    const result = await readDerivedSlugPosition({ slug: "example", worktreePath: "/repo.example", identity: "andrew", readRoster });
    expect(readRoster).toHaveBeenCalledWith("andrew");
    expect(result).toMatchObject({ position: { checkoutPath: "/repo.example", verifying: true }, warnings: [] });
  });

  it.each([
    ["no checkout is registered", { worktreePath: undefined, identity: "andrew" }],
    ["no identity is configured", { worktreePath: "/repo.example", identity: null }],
  ])("skips the roster read when %s", async (_case, input) => {
    const readRoster = vi.fn(async () => []);
    expect(await readDerivedSlugPosition({ slug: "example", ...input, readRoster })).toEqual({ position: null, warnings: [] });
    expect(readRoster).not.toHaveBeenCalled();
  });

  it("degrades a failed roster read to a warning and no position", async () => {
    const readRoster = vi.fn(async () => { throw new Error("topology unavailable"); });
    expect(await readDerivedSlugPosition({ slug: "example", worktreePath: "/repo.example", identity: "andrew", readRoster }))
      .toEqual({ position: null, warnings: ["Derived position for example is unavailable: topology unavailable"] });
  });
});

describe("projectScopeWindow from a checkout position", () => {
  it("keeps a finished plan waiting on edges open, and says its task list is recorded", () => {
    const position = projectDerivedSlugPosition(resolved(context({
      sessionType: "planning", workflow: "planning", stage: "generate-tasks", workUnitStage: null,
      taskCursor: cursorAt("1.1", "Write the exclude entries"),
    })));
    expect(projectScopeWindow("planning", position)).toEqual({
      window: "open", basis: "checkout", reason: "not yet activated (planning: generate-tasks, task list recorded)",
    });
  });

  it("gates an activated work unit before its verification phase", () => {
    const position = projectDerivedSlugPosition(resolved(context({ taskCursor: cursorAt("10.4", "Late writes and ends") })));
    expect(position).toMatchObject({ openTask: { id: "10.4", title: "Late writes and ends" }, verifying: false });
    expect(projectScopeWindow("active", position)).toEqual({
      window: "gated", basis: "checkout", reason: "activated, before its verification phase (task 10.4)",
    });
  });

  it("closes a work unit whose open task is the terminal verification task", () => {
    const position = projectDerivedSlugPosition(resolved(context({ taskCursor: cursorAt("8.1", "Complete verification") })));
    expect(position.verifying).toBe(true);
    expect(projectScopeWindow("active", position)).toEqual({
      window: "closed", basis: "checkout", reason: "in its verification phase (task 8.1)",
    });
  });

  it("does not read a verification title on another task as the terminal phase", () => {
    const position = projectDerivedSlugPosition(resolved(context({ taskCursor: cursorAt("3.4", "Complete verification") })));
    expect(position.verifying).toBe(false);
    expect(projectScopeWindow("active", position).window).toBe("gated");
  });

  it.each([
    ["verification closeout", context({ workUnitStage: "verification-closeout", taskCursor: { status: "no-open-task" } })],
    ["prepublication", context({ sessionType: "prepublication", workflow: "prepare-work-unit", workUnitStage: null })],
    ["integration", context({ sessionType: "integration", workflow: "integrate-work-unit", workUnitStage: null })],
  ])("closes a work unit in %s", (_case, ctx) => {
    expect(projectScopeWindow("active", projectDerivedSlugPosition(resolved(ctx))).window).toBe("closed");
  });

  it("names the unreadable cursor rather than guessing gated or closed", () => {
    const position = projectDerivedSlugPosition(resolved(context({
      taskCursor: { status: "malformed", error: { line: 4, message: "bad marker" } },
    })));
    expect(projectScopeWindow("active", position)).toEqual({
      window: null, basis: "checkout", reason: "task cursor is malformed, so whether verification began cannot be read",
    });
  });

  it("falls back to lifecycle state when the checkout has no session type", () => {
    const position = projectDerivedSlugPosition(resolved(context({ sessionType: null, workUnitStage: null })));
    expect(projectScopeWindow("integrating", position)).toEqual({ window: "closed", basis: "lifecycle", reason: "integrating" });
  });
});

describe("projectScopeWindow from lifecycle state alone", () => {
  it.each<[LifecycleState, "open" | "gated" | "closed" | null]>([
    ["provisional", "open"],
    ["planned", "open"],
    ["planning", "open"],
    ["active", null],
    ["integrating", "closed"],
    ["shipped", "closed"],
    ["parked", null],
    ["nonexistent", null],
  ])("reads %s as %s", (state, window) => {
    expect(projectScopeWindow(state, null)).toMatchObject({ window, basis: "lifecycle" });
  });
});

describe("projectScopeWindow for paused work", () => {
  const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-01-02T03:04:05.000Z", reason: "Waiting" });
  const pausedWindow = {
    window: null, basis: "lifecycle", reason: "paused; a routed concern waits for its resumption",
  };

  it.each([
    ["planning", context({ sessionType: "planning", workflow: "planning", stage: "draft-design", workUnitStage: null })],
    ["active", context({ taskCursor: cursorAt("2.1", "Build the view") })],
  ] as const)("closes the %s checkout window on the pause's lifecycle basis", (state, ctx) => {
    const position = projectDerivedSlugPosition(resolved(ctx));
    expect(projectScopeWindow(state, position, pause)).toEqual(pausedWindow);
  });

  it.each(["planning", "active"] as const)("waits for paused %s work without a checkout", state => {
    expect(projectScopeWindow(state, null, pause)).toEqual(pausedWindow);
  });
});
