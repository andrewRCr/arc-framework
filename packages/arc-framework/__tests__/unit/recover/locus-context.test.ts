/** Recovery context derivation from the exact entering-checkout frame. */

import { describe, expect, it } from "vitest";

import type { LoadSetManifest } from "../../../src/lib/load-set/types.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import {
  DRAFT_DESIGN_WORKFLOW_PATH,
  RUN_ERRAND_WORKFLOW_PATH,
  deriveRecoveryLocusContext,
} from "../../../src/lib/recover/locus-context.js";

const WU_LOAD_SET = {
  manifestVersion: 1,
  entries: [
    { path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md", readMode: { kind: "full" } },
    { path: ".arc/active/tasks-demo.md", readMode: { kind: "partial-strategic" } },
    { path: ".arc/system/workflows/arc/process-task-loop.md", readMode: { kind: "full" } },
  ],
} satisfies LoadSetManifest;

const TASK_CURSOR = {
  status: "found" as const,
  cursor: {
    section: { id: "2.5", title: "Recover the session", lineHint: 30 },
    leaf: { id: "2.5.a", title: "Derive the frame", lineHint: 34 },
  },
};

function baseRow(overrides: Partial<DerivedCheckoutRow> = {}): DerivedCheckoutRow {
  return {
    kind: "free-primary",
    checkout: { path: "/repo", head: "a".repeat(40), branch: "main", detached: false, primary: true },
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: null,
    ...overrides,
  } as DerivedCheckoutRow;
}

function workUnit(path = "/repo-wu"): DerivedCheckoutRow {
  return baseRow({
    kind: "work-unit",
    checkout: {
      path,
      head: "b".repeat(40),
      branch: "fix/demo",
      detached: false,
      primary: path === "/repo",
    },
    subject: { kind: "work-unit", key: "demo" },
    lifecycleLocation: "active",
    context: {
      kind: "resolved",
      metaPath: ".arc/active/meta-demo.md",
      owner: "andrew",
      branch: "fix/demo",
      sessionType: "execution",
      workflow: "process-task-loop",
      stage: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskCursor: TASK_CURSOR,
      cohortDocPath: null,
      loadSet: WU_LOAD_SET,
    },
  });
}

function transient(options: {
  kind?: "errand" | "groom" | "housekeep" | "partial-errand";
  parentCheckoutPath?: string | null;
} = {}): DerivedCheckoutRow {
  const kind = options.kind ?? "errand";
  return baseRow({
    kind: "transient",
    checkout: {
      path: "/repo-child",
      head: "c".repeat(40),
      branch: "errand/demo",
      detached: false,
      primary: false,
    },
    markerGeneration: `sha256:${"d".repeat(64)}`,
    parentCheckoutPath: options.parentCheckoutPath ?? "/repo-wu",
    subject: kind === "partial-errand"
      ? { kind, key: "demo", claimId: null }
      : { kind, key: "demo", claimId: "e".repeat(32) },
  });
}

function frame(
  entering: DerivedCheckoutRow,
  siblings: readonly DerivedCheckoutRow[] = [],
  identityDiscovery: DerivedLocusFrame["identityDiscovery"] = { kind: "absent" },
): DerivedLocusFrame {
  return {
    roster: [entering, ...siblings],
    entering: { kind: "selected", row: entering },
    primaryAvailability: { kind: "free", checkoutPath: "/repo" },
    identityDiscovery,
    active: entering.kind === "work-unit"
      && entering.subject.kind === "work-unit"
      && entering.context !== null
      ? { checkoutPath: entering.checkout.path, subject: entering.subject, context: entering.context }
      : null,
  };
}

function derive(state: DerivedLocusFrame) {
  return deriveRecoveryLocusContext({
    state,
    identity: "andrew",
    workingMemoryPath: "/repo/.arc/user/andrew/WORKING-MEMORY.md",
  });
}

describe("deriveRecoveryLocusContext", () => {
  it("copies the entering work unit's shared workflow, load set, and task cursor", () => {
    const result = derive(frame(workUnit()));

    expect(result.frame).toEqual({
      kind: "resolved",
      subject: { kind: "work-unit", key: "demo" },
      checkoutPath: "/repo-wu",
      parentCheckoutPath: null,
      workflow: "process-task-loop",
      sessionType: "execution",
    });
    expect(result.loadSet).toBe(WU_LOAD_SET);
    expect(result.taskCursor).toBe(TASK_CURSOR);
  });

  it("uses the exact marker parent work unit and appends the transient workflow", () => {
    const result = derive(frame(transient(), [workUnit()]));

    expect(result.frame).toMatchObject({
      subject: { kind: "errand", key: "demo" },
      checkoutPath: "/repo-child",
      parentCheckoutPath: "/repo-wu",
      workflow: "run-errand",
      sessionType: "execution",
    });
    expect(result.loadSet.entries.at(-1)).toEqual({
      path: RUN_ERRAND_WORKFLOW_PATH,
      readMode: { kind: "full" },
    });
    expect(result.taskCursor).toBe(TASK_CURSOR);
  });

  it("degrades a missing marker parent to base context without losing the parent fact", () => {
    const result = derive(frame(transient({ parentCheckoutPath: "/moved-parent" })));

    expect(result.frame).toMatchObject({
      checkoutPath: "/repo-child",
      parentCheckoutPath: "/moved-parent",
      workflow: "run-errand",
      sessionType: null,
    });
    expect(result.loadSet.entries.at(-1)?.path).toBe(RUN_ERRAND_WORKFLOW_PATH);
    expect(result.loadSet.entries.some((entry) => entry.path.includes("meta-demo"))).toBe(false);
    expect(result.taskCursor).toBeNull();
  });

  it("ignores an arbitrary malformed sibling while recovering the entering work unit", () => {
    const malformed = baseRow({
      kind: "unresolved-checkout",
      checkout: { path: "/repo-bad", head: "f".repeat(40), branch: null, detached: true, primary: false },
      diagnostics: [{ code: "marker-unreadable", message: "bad sibling" }],
    });
    expect(derive(frame(workUnit(), [malformed])).frame).toMatchObject({
      subject: { kind: "work-unit", key: "demo" },
      checkoutPath: "/repo-wu",
    });
  });

  it("keeps a WU healthy when shared identity discovery is unavailable", () => {
    const result = derive(frame(workUnit(), [], {
      kind: "error",
      stage: "tree",
      message: "identity root unreadable",
    }));
    expect(result.frame).toMatchObject({ subject: { kind: "work-unit" }, workflow: "process-task-loop" });
  });

  it("routes groom and partial Errand subjects through their owning workflows", () => {
    expect(derive(frame(transient({ kind: "groom", parentCheckoutPath: null }))).loadSet.entries.at(-1)?.path)
      .toBe(DRAFT_DESIGN_WORKFLOW_PATH);
    expect(derive(frame(transient({ kind: "partial-errand", parentCheckoutPath: null }))).frame)
      .toMatchObject({ subject: { kind: "partial-errand" }, workflow: "run-errand" });
  });

  it("returns between-work-units context for a free primary", () => {
    expect(derive(frame(baseRow())).frame).toEqual({
      kind: "none",
      subject: null,
      checkoutPath: "/repo",
      parentCheckoutPath: null,
      workflow: null,
      sessionType: null,
    });
  });

  it("refuses an unresolved entering checkout without consulting siblings", () => {
    const state: DerivedLocusFrame = {
      ...frame(workUnit()),
      entering: {
        kind: "unresolved",
        checkoutPath: "/repo-wu",
        diagnostics: [{ code: "checkout-evidence-unavailable", message: "unreadable" }],
      },
    };
    expect(() => derive(state)).toThrow("Entering checkout is unresolved");
  });

  it("keeps an identity-backed transient unresolved when its identity basis is unavailable", () => {
    const unresolved = baseRow({
      kind: "unresolved-checkout",
      checkout: {
        path: "/repo-child",
        head: "c".repeat(40),
        branch: "errand/demo",
        detached: false,
        primary: false,
      },
      diagnostics: [{ code: "identity-basis-unavailable", message: "identity root unreadable" }],
    });
    const state: DerivedLocusFrame = {
      ...frame(unresolved, [], { kind: "error", stage: "tree", message: "identity root unreadable" }),
      entering: {
        kind: "unresolved",
        checkoutPath: "/repo-child",
        diagnostics: unresolved.diagnostics,
      },
    };
    expect(() => derive(state)).toThrow("Entering checkout is unresolved");
  });

  it("exposes no retired record or lease authority in the recovery wire", () => {
    const wire = JSON.stringify(derive(frame(transient(), [workUnit()])));
    expect(wire).not.toMatch(/recordId|leaseId|sessionHomePath|activeRecordId|parentRecordId/u);
  });
});
