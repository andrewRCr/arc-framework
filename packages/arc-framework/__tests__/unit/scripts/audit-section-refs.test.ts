import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditFiles,
  collectAuditFiles,
} from "../../../src/scripts/audit-section-refs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../..");

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

describe("auditFiles", () => {
  it("passes files without section-sign references", () => {
    const result = auditFiles(
      ["packages/arc-framework/src/example.ts"],
      fakeReader({
        "packages/arc-framework/src/example.ts":
          "const value = 'describe behavior directly';\n",
      }),
    );

    expect(result).toEqual({ pass: true, diagnostics: [] });
  });

  it("reports section-sign references with line and column", () => {
    const result = auditFiles(
      ["packages/arc-framework/__tests__/example.test.ts"],
      fakeReader({
        "packages/arc-framework/__tests__/example.test.ts":
          ["first line", `bad ${"\u00a7"} reference`].join("\n"),
      }),
    );

    expect(result.pass).toBe(false);
    expect(result.diagnostics).toEqual([
      "packages/arc-framework/__tests__/example.test.ts:2:5: section-sign references are not allowed in source or tests; describe the invariant directly",
    ]);
  });
});

describe("collectAuditFiles", () => {
  it("returns package source and test files", () => {
    const files = collectAuditFiles(repoRoot);

    expect(files).toContain("packages/arc-framework/src/scripts/audit-section-refs.ts");
    expect(files).toContain(
      "packages/arc-framework/__tests__/unit/scripts/audit-section-refs.test.ts",
    );
    expect(files.every((file) => file.endsWith(".ts"))).toBe(true);
  });
});
