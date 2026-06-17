/**
 * Unit tests for the Current Workflow encoding-consistency validator — the
 * write-side drift guard asserting `Current Workflow` agrees with the rest of
 * the meta state across the `(State, Current Workflow, Design)` tuple.
 */

import { describe, it, expect } from "vitest";

import { checkCurrentWorkflowConsistency } from "../../../src/lib/active/current-workflow-consistency.js";

const check = (
  state: string | null,
  currentWorkflow: string | null,
  design: string | null,
): string[] => checkCurrentWorkflowConsistency({ state, currentWorkflow, design });

describe("checkCurrentWorkflowConsistency — encoding-consistency validator", () => {
  describe("valid tuples pass (empty diagnostics)", () => {
    it("draft-design with a draft-* Design pointer", () => {
      expect(check("Planning", "draft-design", "draft-foo.md")).toEqual([]);
    });

    it("draft-design before a draft exists ([none] Design)", () => {
      expect(check("Planning", "draft-design", "[none]")).toEqual([]);
    });

    it("create-spec with the draft still authoritative (not yet repointed)", () => {
      expect(check("Planning", "create-spec", "draft-foo.md")).toEqual([]);
    });

    it("create-spec for a draft-skipping Light WU ([none] Design)", () => {
      expect(check("Planning", "create-spec", "[none]")).toEqual([]);
    });

    it("generate-tasks with the Design repointed to a spec-*", () => {
      expect(check("Planning", "generate-tasks", "spec-foo.md")).toEqual([]);
    });

    it("generate-tasks with a layered (multi-spec) Design", () => {
      expect(check("Planning", "generate-tasks", "spec-a.md, spec-b.md")).toEqual([]);
    });

    it("a non-planning state with Current Workflow [none]", () => {
      expect(check("Active", "[none]", "spec-foo.md")).toEqual([]);
    });

    it("a legacy non-planning meta with an absent Current Workflow", () => {
      expect(check("Active", null, "spec-foo.md")).toEqual([]);
    });
  });

  it("fails a non-planning state carrying a live Current Workflow", () => {
    const diagnostics = check("Active", "generate-tasks", "spec-foo.md");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatch(/non-planning/i);
  });

  it("fails generate-tasks whose Design still points at a draft-* (un-repointed)", () => {
    const diagnostics = check("Planning", "generate-tasks", "draft-foo.md");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatch(/spec-\*/);
  });

  it("fails a Current Workflow outside the planning enum under State: Planning", () => {
    const diagnostics = check("Planning", "wibble", "draft-foo.md");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatch(/not a planning stage/i);
  });

  it("fails an injected mismatch — create-spec with a prematurely repointed spec Design", () => {
    const diagnostics = check("Planning", "create-spec", "spec-foo.md");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatch(/draft-\*/);
  });
});
