/** Unit coverage for Vitest-backed E2E membership collection. */

import { describe, expect, it, vi } from "vitest";

import { deriveEffectiveE2EShards } from "../../src/lib/test-cost/shard-run.js";

describe("deriveEffectiveE2EShards", () => {
  it("collects each matrix leg with the skip-build flag and validates the partition", async () => {
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
      readWorkflow: async () => [
        "jobs:",
        "  e2e:",
        "    strategy:",
        "      matrix:",
        "        shard: [1, 2, 3, 4]",
      ].join("\n"),
    });

    expect(result.legs).toEqual([
      { shard: 1, files: ["a.test.ts"] },
      { shard: 2, files: ["b.test.ts"] },
      { shard: 3, files: ["c.test.ts"] },
      { shard: 4, files: ["d.test.ts"] },
    ]);
    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute.mock.calls[0]?.[1]).toEqual(["vitest", "list", "--project", "e2e", "--json"]);
    expect(execute.mock.calls[1]?.[1]).toEqual(["vitest", "list", "--project", "e2e", "--shard=1/4", "--json"]);
  });
});
