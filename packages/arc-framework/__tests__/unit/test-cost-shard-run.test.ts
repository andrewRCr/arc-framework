/** Unit coverage for Vitest-backed E2E membership collection. */

import { describe, expect, it, vi } from "vitest";

import { deriveEffectiveE2EShards } from "../../src/lib/test-cost/shard-run.js";

describe("deriveEffectiveE2EShards", () => {
  it("uses collecting list with workflow exclusions and the skip-build flag", async () => {
    const files = ["a", "b", "c", "d"];
    const execute = vi.fn(async (_command, args, options) => {
      expect(args).not.toContain("--filesOnly");
      expect(options.env["ARC_E2E_SKIP_BUILD"]).toBe("1");
      const shard = args.find((arg: string) => arg.startsWith("--shard="));
      const selected = shard === undefined ? files : [files[Number(shard[8]) - 1]];
      return {
        stdout: JSON.stringify(selected.map((file) => ({
          file: `/repo/packages/arc-framework/${file}.test.ts`,
          projectName: "e2e",
          name: `${file} test`,
        }))),
      };
    });

    const result = await deriveEffectiveE2EShards({
      packageRoot: "/repo/packages/arc-framework",
      workflowPath: "/repo/.github/workflows/ci.yml",
      env: {},
    }, {
      execute,
      readWorkflow: async () => `
        - shard: 1
          anchor: anchor-a.e2e.test.ts
        - shard: 2
          anchor: anchor-b.e2e.test.ts
        - shard: 3
          anchor: anchor-c.e2e.test.ts
        - shard: 4
          anchor: anchor-d.e2e.test.ts
        --exclude='**/anchor-a.e2e.test.ts'
        --exclude='**/anchor-b.e2e.test.ts'
        --exclude='**/anchor-c.e2e.test.ts'
        --exclude='**/anchor-d.e2e.test.ts'
      `,
    });

    expect(result.legs).toEqual([
      { shard: 1, anchor: "anchor-a.e2e.test.ts", remainder: ["a.test.ts"] },
      { shard: 2, anchor: "anchor-b.e2e.test.ts", remainder: ["b.test.ts"] },
      { shard: 3, anchor: "anchor-c.e2e.test.ts", remainder: ["c.test.ts"] },
      { shard: 4, anchor: "anchor-d.e2e.test.ts", remainder: ["d.test.ts"] },
    ]);
    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute.mock.calls[1]?.[1]).toEqual(expect.arrayContaining([
      "list", "--project", "e2e", "--exclude", "**/anchor-a.e2e.test.ts", "--shard=1/4", "--json",
    ]));
  });
});
