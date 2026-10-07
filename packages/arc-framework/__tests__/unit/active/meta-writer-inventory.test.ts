import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDirectory = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = resolve(testDirectory, "../../../src");

const producerPaths = [
  "lib/errand/promote.ts",
  "lib/git/worktree-scaffold.ts",
  "lib/work-unit/pointer-record.ts",
  "lib/work-unit/verbs/park-resume.ts",
  "lib/work-unit/verbs/stub.ts",
] as const;

describe("semantic meta writer boundary", () => {
  it("keeps full-record producers off projection override contracts", () => {
    for (const relativePath of producerPaths) {
      const source = readFileSync(resolve(sourceRoot, relativePath), "utf8");
      expect(source, relativePath).not.toMatch(/MetaProjectionOverrides|renderMetaProjectionFile/u);
    }
  });

});
