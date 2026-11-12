/** Package/project contract for the reserved delivery presentation namespace. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

describe("delivery branch namespace guidance", () => {
  it("ships and installs the same state-independent identity boundary", async () => {
    const packagePath = resolve("arc/system/methods/branch-format.md");
    const installedPath = resolve("../../.arc/system/methods/branch-format.md");
    const [packaged, installed] = await Promise.all([
      readFile(packagePath, "utf8"),
      readFile(installedPath, "utf8"),
    ]);

    expect(installed).toBe(packaged);
    expect(packaged).toMatch(softWrappedProse("`delivery/` prefix is a reserved presentation namespace"));
    expect(packaged).toContain("exact delivery-state ref/head bindings");
  });
});
