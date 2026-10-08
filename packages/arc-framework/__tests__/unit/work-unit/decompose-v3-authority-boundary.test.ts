/** Live decomposition authority and shipped methodology synchronization boundaries. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../../..");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "../..");

describe("decomposition v3 authority boundary", () => {
  it("keeps the shipped boundary-fit method and park workflow synchronized", () => {
    const packageMethod = readFileSync(join(PACKAGE_ROOT, "arc/system/methods/assess-boundary-fit.md"), "utf8");
    const projectMethod = readFileSync(
      join(PROJECT_ROOT, ".arc/system/methods/assess-boundary-fit.md"),
      "utf8",
    );
    const packagePark = readFileSync(
      join(PACKAGE_ROOT, "arc/system/workflows/arc/work-unit-lifecycle/park-work-unit.md"),
      "utf8",
    );
    const projectPark = readFileSync(
      join(PROJECT_ROOT, ".arc/system/workflows/arc/work-unit-lifecycle/park-work-unit.md"),
      "utf8",
    );

    expect(projectMethod).toBe(packageMethod);
    expect(projectPark).toBe(packagePark);
  });
});
