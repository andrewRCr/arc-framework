/** Unit coverage for recognizing managed paths as the layout addresses that project them. */

import { describe, expect, it } from "vitest";

import { SlugSchema } from "../../../src/lib/kernel/index.js";

import {
  ProjectDocumentKindSchema,
  WorkUnitArtifactKindSchema,
  WorkUnitPlacementSchema,
  identifyWorkUnitArtifactPath,
  isProjectDocumentPath,
  resolveArcPath,
  type WorkUnitPlacement,
} from "../../../src/lib/layout/index.js";

const PLACEMENTS: readonly WorkUnitPlacement[] = [
  { kind: "active", scope: { kind: "project" } },
  { kind: "active", scope: { kind: "contributor", identity: "andrew" } },
  { kind: "backlog", commitment: "planned", cohort: [] },
  { kind: "backlog", commitment: "planned", cohort: ["review-protocol", "alignment"] },
  { kind: "backlog", commitment: "provisional", cohort: [] },
  { kind: "completed", quarter: "2026-q3", sequence: "01" },
].map((placement) => WorkUnitPlacementSchema.parse(placement));

const SLUG = SlugSchema.parse("example");

describe("work-unit artifact identification", () => {
  it("recognizes every artifact kind at every placement the layout projects", () => {
    for (const placement of PLACEMENTS) {
      for (const artifact of WorkUnitArtifactKindSchema.options) {
        const path = resolveArcPath({ kind: "work-unit-artifact", placement, slug: SLUG, artifact });

        expect(identifyWorkUnitArtifactPath(path), path).toEqual({ placement, slug: SLUG, artifact });
      }
    }
  });

  it("identifies one artifact across the lifecycle relocation that moves it", () => {
    const active = identifyWorkUnitArtifactPath(".arc/active/tasks-example.md");
    const completed = identifyWorkUnitArtifactPath(".arc/completed/2026-q3/07_example/tasks-example.md");

    expect(active?.slug).toBe(completed?.slug);
    expect(active?.artifact).toBe(completed?.artifact);
    expect(active?.placement).not.toEqual(completed?.placement);
  });

  it("refuses a path no work-unit artifact address projects", () => {
    const refused = [
      ".arc/backlog/ROADMAP.md",
      ".arc/backlog/planned/example/cohort-example.md",
      ".arc/active/tasks-example.txt",
      ".arc/active/nested/tasks-example.md",
      ".arc/completed/2026-q5/01_example/tasks-example.md",
      ".arc/completed/2026-q3/1_example/tasks-example.md",
      ".arc/completed/2026-q3/01_other/tasks-example.md",
      "packages/arc-framework/src/lib/work-unit/tasks-example.md",
      "tasks-example.md",
    ];

    expect(refused.filter((path) => identifyWorkUnitArtifactPath(path) !== null)).toEqual([]);
  });

  it("reads project documents off the layout's own document vocabulary", () => {
    const documented = ProjectDocumentKindSchema.options
      .map((document) => resolveArcPath({ kind: "project-document", document }));

    expect(documented.length).toBeGreaterThan(0);
    expect(documented.filter((path) => !isProjectDocumentPath(path))).toEqual([]);
    expect(isProjectDocumentPath(".arc/active/meta-example.md")).toBe(false);
  });
});
