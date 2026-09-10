/** Unit coverage for the shared evidence-applicability path registry. */

import { describe, expect, it } from "vitest";

import {
  classifyPathTreatment,
} from "../../../src/lib/evidence-applicability/index.js";

const context = {
  workUnit: "example",
  projectionPaths: new Set([
    ".arc/system/.internal/candidates/example.json",
    ".arc/system/.internal/candidates/example.boundary.json",
  ]),
};

describe("evidence applicability path treatment", () => {
  it("keeps ordinary implementation and shipped framework content reviewable", () => {
    expect(classifyPathTreatment("packages/arc-framework/src/example.ts", context)).toBe("reviewable");
    expect(classifyPathTreatment(".arc/system/workflows/arc/process-task-loop.md", context))
      .toBe("reviewable");
    expect(classifyPathTreatment(".arc/active/tasks-sibling.md", context)).toBe("reviewable");
  });

  it("makes the complete identity-bound planning group evidence-neutral", () => {
    for (const path of [
      ".arc/active/meta-example.md",
      ".arc/active/draft-example.md",
      ".arc/active/spec-example.md",
      ".arc/active/tasks-example.md",
      ".arc/active/notes-example.md",
      ".arc/active/analysis-example.md",
      ".arc/backlog/planned/cohort/example/tasks-example.md",
      ".arc/completed/2026-q3/01_example/tasks-example.md",
      ".arc/system/.internal/candidates/example.json",
      ".arc/system/.internal/candidates/example.boundary.json",
    ]) {
      expect(classifyPathTreatment(path, context), path).toBe("evidence-neutral");
    }
  });

  it("recognizes project readiness without work-unit identity", () => {
    expect(classifyPathTreatment(".arc/backlog/ROADMAP.md")).toBe("regenerable");
    expect(classifyPathTreatment(".arc/active/meta-example.md")).toBe("reviewable");
  });
});
