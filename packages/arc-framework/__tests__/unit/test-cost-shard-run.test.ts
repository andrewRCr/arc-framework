/** Native JSON membership collection using the workflow's handed duration input. */
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveEffectiveE2EShards, type E2EShardRunDependencies } from "../../src/lib/test-cost/shard-run.js";

const packageRoot = resolve("native-membership-fixture");
const durationFile = join(packageRoot, "handed-e2e.json");
const workflow = 'jobs:\n  e2e:\n    strategy:\n      matrix:\n        shard: [1,2,3,4]\n';
const dependencies: E2EShardRunDependencies = {
  readWorkflow: async () => workflow,
  execute: async (_command, args, options) => {
    const nativeJson = args.includes("--json") && !args.includes("--filesOnly");
    const handed = options.env.ARC_TEST_DURATION_FILE === durationFile && options.env.ARC_E2E_SKIP_BUILD === "1";
    const shard = args.find((argument) => argument.startsWith("--shard="));
    const index = shard === undefined ? undefined : Number(shard.split(/[=/]/u)[1]);
    const files = nativeJson && handed ? index === undefined ? ["a", "b", "c", "d"] : ["abcd"[index - 1]] : ["wrong"];
    return { stdout: JSON.stringify(files.flatMap((file) => ["one", "two"].map((name) => ({
      file: join(packageRoot, `${file}.test.ts`), projectName: "e2e", name,
    })))) };
  },
};

describe("duration-balanced native membership collection", () => {
  it("collects the whole tier and each shard with the same handed input", async () => {
    expect(await deriveEffectiveE2EShards({ packageRoot, workflowPath: "ci.yml", env: {}, durationFile }, dependencies))
      .toEqual({ wholeTier: ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"], legs: [
        { shard: 1, files: ["a.test.ts"] }, { shard: 2, files: ["b.test.ts"] },
        { shard: 3, files: ["c.test.ts"] }, { shard: 4, files: ["d.test.ts"] },
      ] });
  });
  it("refuses an override that disagrees with the literal workflow matrix", async () => {
    await expect(deriveEffectiveE2EShards({ packageRoot, workflowPath: "ci.yml", env: {}, durationFile, shardCount: 3 }, dependencies))
      .rejects.toThrow(/workflow/u);
  });
});
