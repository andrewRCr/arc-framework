/** Contract proof for boundary-fit dispatch at the design-authoring fire-points. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseWorkflowFrontmatter } from "../../../src/scripts/audit-method-triggers.js";
import { softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../../..");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "../..");

describe("boundary-fit workflow contract", () => {
  for (const workflow of ["draft-design.md", "create-spec.md"]) {
    it(`dispatches all three outcomes from ${workflow}`, () => {
      const relativePath = `system/workflows/arc/${workflow}`;
      const packaged = readFileSync(join(PACKAGE_ROOT, "arc", relativePath), "utf8");
      const installed = readFileSync(join(PROJECT_ROOT, ".arc", relativePath), "utf8");
      const declarations = parseWorkflowFrontmatter(packaged);

      expect(declarations.parseError).toBeUndefined();
      expect(declarations.methods).toContain("assess-boundary-fit");
      expect(declarations.methods).not.toContain("assess-cohort-fit");
      expect(packaged).toContain("| Outcome");
      expect(packaged).toContain("`stays one WU`");
      expect(packaged).toContain("`cut-map`");
      expect(packaged).toContain("`stays one WU + delivery-plan candidate`");
      expect(packaged).toContain("`decompose-work-unit`");
      expect(packaged).toMatch(softWrappedProse("outcome and evidence basis"));
      expect(packaged).toContain("slice-aware");
      expect(packaged).toMatch(softWrappedProse("without publishing or binding delivery state"));
      expect(packaged).toMatch(softWrappedProse("compare the evidence semantically"));
      expect(packaged).toMatch(softWrappedProse("material new-evidence delta"));
      expect(packaged).toMatch(softWrappedProse("materially unchanged"));
      expect(packaged).toMatch(/No CLI\s+parser, fingerprint, schema, or new decision record is introduced/u);
      expect(installed).toBe(packaged);
    });
  }
});
