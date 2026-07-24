/** Unit coverage for the public ARC layout schemas. */

import { describe, expect, expectTypeOf, it } from "vitest";

import { SlugSchema } from "../../../src/lib/kernel/index.js";
import {
  ArcLayoutAddressSchema,
  ArchiveQuarterSchema,
  ArchiveSequenceSchema,
  TemplateOutputPathSchema,
  TemplateRelativePathSchema,
  WorkUnitPlacementSchema,
  type ArcLayoutAddress,
  type ArchiveQuarter,
  type ArchiveSequence,
  type TemplateOutputPath,
  type TemplateRelativePath,
  type WorkUnitPlacement,
} from "../../../src/lib/layout/index.js";

const slug = (value: string) => SlugSchema.parse(value);

describe("layout schemas", () => {
  it("accepts archive coordinates and preserves distinct branded roles", () => {
    const quarter = ArchiveQuarterSchema.parse("2026-q4");
    const sequence = ArchiveSequenceSchema.parse("10");
    const template = TemplateRelativePathSchema.parse("system/rules/file.template.md");
    const output = TemplateOutputPathSchema.parse("system/rules/file.md");

    expect(quarter).toBe("2026-q4");
    expect(sequence).toBe("10");
    expectTypeOf(quarter).toEqualTypeOf<ArchiveQuarter>();
    expectTypeOf(sequence).toEqualTypeOf<ArchiveSequence>();
    expectTypeOf(template).toEqualTypeOf<TemplateRelativePath>();
    expectTypeOf(output).toEqualTypeOf<TemplateOutputPath>();
    expectTypeOf<TemplateRelativePath>().not.toEqualTypeOf<TemplateOutputPath>();
  });

  it.each(["2026-q0", "2026-q5", "26-q1", "2026-Q1"])("rejects invalid quarter %s", (value) => {
    expect(ArchiveQuarterSchema.safeParse(value).success).toBe(false);
  });

  it.each(["00", "1", "09", "010", "-1", "1.5"])("rejects invalid sequence %s", (value) => {
    const expected = value === "09";
    expect(ArchiveSequenceSchema.safeParse(value).success).toBe(expected);
  });

  it("accepts every physical placement shape", () => {
    const placements = [
      { kind: "active", scope: { kind: "project" } },
      { kind: "active", scope: { kind: "contributor", identity: slug("andrew") } },
      { kind: "backlog", commitment: "planned", cohort: [] },
      { kind: "backlog", commitment: "provisional", cohort: [slug("parent"), slug("leaf")] },
      { kind: "completed", quarter: "2026-q3", sequence: "01" },
    ];

    for (const placement of placements) expect(WorkUnitPlacementSchema.parse(placement)).toEqual(placement);
    expectTypeOf(WorkUnitPlacementSchema.parse(placements[0])).toEqualTypeOf<WorkUnitPlacement>();
  });

  it("rejects malformed and non-strict placements", () => {
    const invalid = [
      { kind: "active" },
      { kind: "active", scope: { kind: "contributor" } },
      { kind: "active", scope: { kind: "project", extra: true } },
      { kind: "backlog", commitment: "planned" },
      { kind: "backlog", commitment: "planned", cohort: [slug("a"), slug("b"), slug("c")] },
      { kind: "completed", quarter: "2026-q1", sequence: "1" },
    ];
    for (const placement of invalid) expect(WorkUnitPlacementSchema.safeParse(placement).success).toBe(false);
  });

  it("accepts every address family", () => {
    const projectActive = { kind: "active", scope: { kind: "project" } } as const;
    const addresses = [
      { kind: "arc-root" },
      { kind: "placement-root", tier: "active" },
      { kind: "work-unit-container", placement: projectActive, slug: slug("sample") },
      { kind: "work-unit-artifact", placement: projectActive, slug: slug("sample"), artifact: "meta" },
      { kind: "cohort-document", cohort: [slug("group")], placement: { kind: "planned" } },
      {
        kind: "cohort-document",
        cohort: [slug("group"), slug("leaf")],
        placement: { kind: "completed", quarter: "2026-q1", sequence: "02", closeout: "leaf" },
      },
      { kind: "procedure-root", family: "workflows" },
      { kind: "project-document", document: "roadmap" },
      {
        kind: "user-document",
        identity: slug("andrew"),
        document: { kind: "session-notes", workUnit: slug("sample") },
      },
      { kind: "user-document", identity: slug("andrew"), document: { kind: "working-memory" } },
    ];

    for (const address of addresses) expect(ArcLayoutAddressSchema.parse(address)).toEqual(address);
    expectTypeOf(ArcLayoutAddressSchema.parse(addresses[0])).toEqualTypeOf<ArcLayoutAddress>();
  });

  it("rejects unsafe, incomplete, and non-strict addresses", () => {
    const invalid = [
      { kind: "arc-root", extra: true },
      { kind: "placement-root", tier: "unknown" },
      { kind: "work-unit-container", placement: { kind: "active" }, slug: "sample" },
      { kind: "work-unit-artifact", placement: { kind: "active", scope: { kind: "project" } }, slug: "../x", artifact: "meta" },
      { kind: "cohort-document", cohort: [], placement: { kind: "planned" } },
      { kind: "user-document", identity: "Andrew", document: { kind: "working-memory" } },
    ];
    for (const address of invalid) expect(ArcLayoutAddressSchema.safeParse(address).success).toBe(false);
  });

  it.each(["", "/absolute", "C:/drive", "a\\b", "a//b", "a/../b", "a\0b", "e\u0301"])(
    "rejects unsafe template path %s",
    (value) => {
      expect(TemplateRelativePathSchema.safeParse(value).success).toBe(false);
      expect(TemplateOutputPathSchema.safeParse(value).success).toBe(false);
    },
  );
});
