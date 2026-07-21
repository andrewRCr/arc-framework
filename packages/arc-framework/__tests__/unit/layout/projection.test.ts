/** Unit coverage for pure semantic ARC path projection. */

import { describe, expect, it } from "vitest";

import { SlugSchema } from "../../../src/lib/kernel/index.js";
import {
  ArcLayoutAddressSchema,
  LayoutError,
  resolveArcPath,
  type ArcLayoutAddress,
} from "../../../src/lib/layout/index.js";

const slug = (value: string) => SlugSchema.parse(value);
const address = (value: unknown): ArcLayoutAddress => ArcLayoutAddressSchema.parse(value);

describe("resolveArcPath", () => {
  it.each([
    [{ kind: "arc-root" }, ".arc"],
    [{ kind: "placement-root", tier: "active" }, ".arc/active"],
    [{ kind: "placement-root", tier: "planned" }, ".arc/backlog/planned"],
    [{ kind: "placement-root", tier: "provisional" }, ".arc/backlog/provisional"],
    [{ kind: "placement-root", tier: "completed" }, ".arc/completed"],
    [
      { kind: "work-unit-container", placement: { kind: "active", scope: { kind: "project" } }, slug: slug("sample") },
      ".arc/active",
    ],
    [
      {
        kind: "work-unit-container",
        placement: { kind: "active", scope: { kind: "contributor", identity: slug("andrew") } },
        slug: slug("sample"),
      },
      ".arc/user/andrew/active",
    ],
    [
      {
        kind: "work-unit-container",
        placement: { kind: "backlog", commitment: "planned", cohort: [slug("group"), slug("leaf")] },
        slug: slug("sample"),
      },
      ".arc/backlog/planned/group/leaf/sample",
    ],
    [
      {
        kind: "work-unit-container",
        placement: { kind: "completed", quarter: "2026-q3", sequence: "12" },
        slug: slug("sample"),
      },
      ".arc/completed/2026-q3/12_sample",
    ],
    [
      {
        kind: "work-unit-artifact",
        placement: { kind: "active", scope: { kind: "project" } },
        slug: slug("sample"),
        artifact: "meta",
      },
      ".arc/active/meta-sample.md",
    ],
    [
      { kind: "cohort-document", cohort: [slug("group")], placement: { kind: "planned" } },
      ".arc/backlog/planned/group/cohort-group.md",
    ],
    [
      {
        kind: "cohort-document",
        cohort: [slug("group"), slug("leaf")],
        placement: { kind: "completed", quarter: "2026-q2", sequence: "03", closeout: "leaf" },
      },
      ".arc/completed/2026-q2/03a_cohort-leaf/cohort-leaf.md",
    ],
    [
      {
        kind: "cohort-document",
        cohort: [slug("group")],
        placement: { kind: "completed", quarter: "2026-q2", sequence: "04", closeout: "parent" },
      },
      ".arc/completed/2026-q2/04b_cohort-group/cohort-group.md",
    ],
    [{ kind: "procedure-root", family: "methods" }, ".arc/system/methods"],
    [{ kind: "procedure-root", family: "workflows" }, ".arc/system/workflows"],
    [{ kind: "project-document", document: "roadmap" }, ".arc/backlog/ROADMAP.md"],
    [
      {
        kind: "user-document",
        identity: slug("andrew"),
        document: { kind: "session-notes", workUnit: slug("sample") },
      },
      ".arc/user/andrew/sample/SESSION-NOTES.md",
    ],
    [
      { kind: "user-document", identity: slug("andrew"), document: { kind: "working-memory" } },
      ".arc/user/andrew/WORKING-MEMORY.md",
    ],
  ] as const)("projects %# without ambient state", (input, expected) => {
    expect(resolveArcPath(address(input))).toBe(expected);
  });

  it.each([
    null,
    { kind: "arc-root", extra: true },
    { kind: "work-unit-artifact", placement: { kind: "active" }, slug: "sample", artifact: "meta" },
    { kind: "user-document", identity: "../unsafe", document: { kind: "working-memory" } },
  ])("defensively rejects unsafe runtime input %#", (input) => {
    let thrown: unknown;
    try {
      resolveArcPath(input as ArcLayoutAddress);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LayoutError);
    expect(thrown).toMatchObject({ code: "layout.invalid-address" });
    expect((thrown as Error).cause).toBeDefined();
  });
});
